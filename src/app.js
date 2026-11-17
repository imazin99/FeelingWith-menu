const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');

const env = require('./config/env');
const publicMenuRoutes = require('./routes/publicMenuRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Serving uploaded images (LocalDiskProvider): directory listing is
  // disabled by express.static's default behavior (no index generation);
  // only files whose exact name is known are servable (architecture doc,
  // section 5, "Never exposed").
  const uploadDir = path.resolve(process.cwd(), env.localUploadDir);
  app.use('/uploads', express.static(uploadDir, { index: false, redirect: false }));

  // Phase 03: admin dashboard UI — static HTML/CSS/vanilla JS only, served
  // from the same Express app/origin as the API (no separate frontend
  // server, no CORS needed — consistent with the existing same-origin
  // architecture). This is plain static file serving; it never bypasses
  // requireAuth/requireCsrf on the actual /api/admin/* routes below, which
  // every dashboard page calls from the browser exactly like any other
  // client would.
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir, { index: false }));
  app.get('/admin/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'dashboard.html')));

  // Phase 04: public customer menu — same static-serving pattern as the
  // admin dashboard above. This is the one new route added for Phase 04;
  // it serves a plain static HTML page that itself calls the existing,
  // unauthenticated /api/menu/* routes from the browser. It never touches
  // admin routes/session handling and requires no auth of its own.
  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // Preserved exactly as-is (Phase 05A found no defect): a pure liveness
  // check — "is the Node process itself up and able to respond" — with no
  // DB dependency, so a platform's liveness probe never restarts a
  // perfectly healthy process just because the database happens to be
  // briefly unreachable (that's what /ready below is for).
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Phase 05B: readiness check — "is the app ready to actually serve a
  // real request," which for this app means "is MongoDB connected."
  // mongoose.connection.readyState: 0 disconnected, 1 connected,
  // 2 connecting, 3 disconnecting — only 1 counts as ready. Exposes no
  // connection string, credentials, or other infrastructure detail — only
  // the single word describing the current state.
  app.get('/ready', (req, res) => {
    const READY_STATE = 1;
    const readyState = mongoose.connection.readyState;
    if (readyState === READY_STATE) {
      return res.json({ status: 'ready' });
    }
    const READY_STATE_NAMES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    return res.status(503).json({ status: 'not_ready', database: READY_STATE_NAMES[readyState] || 'unknown' });
  });

  app.use('/api/menu', publicMenuRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
