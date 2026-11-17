// Centralizes reading of environment variables so nothing else in the
// codebase reaches into process.env directly (architecture doc, section 4/5:
// "environment variables," never hardcoded secrets or storage choices).
require('dotenv').config({ quiet: true });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  return value;
}

// Code review fix #2: the JWT secret must never silently fall back to the
// unsafe development default in production. 'dev-secret-change-me' is fine
// as a *development-only* convenience (so `npm start` works out of the box
// without a .env file), but a production deployment that is missing
// JWT_SECRET, or that still has this exact placeholder, must refuse to
// start rather than quietly sign sessions with a guessable, publicly-known
// secret. This check runs at module load, so requiring this file (which
// every entry point — src/server.js, tests/helpers/testApp.js — does
// before anything else touches the network) throws synchronously and
// prevents the app from ever reaching app.listen().
const UNSAFE_DEV_JWT_SECRET = 'dev-secret-change-me';
const nodeEnv = process.env.NODE_ENV || 'development';
const rawJwtSecret = process.env.JWT_SECRET;

if (nodeEnv === 'production') {
  if (!rawJwtSecret || rawJwtSecret.trim() === '' || rawJwtSecret === UNSAFE_DEV_JWT_SECRET) {
    throw new Error(
      'Refusing to start: JWT_SECRET is missing or is set to the unsafe development default ' +
        `("${UNSAFE_DEV_JWT_SECRET}"). Set JWT_SECRET to a long, random, production-only value ` +
        '(e.g. `openssl rand -hex 32`) before starting in production.'
    );
  }
}

// Phase 05B (production-safety audit follow-up): MONGODB_URI previously
// fell back silently to a localhost default in EVERY environment,
// production included. A production deployment that simply forgot to set
// MONGODB_URI would not fail loudly — it would try to reach
// "mongodb://localhost:27017/..." inside whatever container/host it's
// running on, which either fails with a confusing connection-refused error
// far from the real cause, or — worse, if some unrelated local MongoDB
// happens to be reachable there — silently starts reading/writing a
// throwaway database nobody intended. Same pattern as the JWT_SECRET guard
// above: fail fast, at startup, with a clear message, rather than lazily
// and confusingly at the first query.
const rawMongodbUri = (process.env.MONGODB_URI || '').trim();
if (nodeEnv === 'production' && !rawMongodbUri) {
  throw new Error(
    'Refusing to start: MONGODB_URI is not set. In production this must point at a real ' +
      'database (e.g. a MongoDB Atlas connection string) — the localhost development default ' +
      'is never used in production.'
  );
}

// Deployment clarification (final review): selfOrigin() in
// src/middleware/csrf.js, used for CSRF Origin validation, previously
// always derived the app's own origin from `${req.protocol}://${req.get('host')}`.
// Behind a reverse proxy that terminates TLS (nginx, Caddy, an ALB, …) and
// forwards plain HTTP to this Express process internally, `req.protocol`
// reports "http" unless Express is explicitly told to trust the proxy's
// X-Forwarded-Proto header — which this app deliberately does NOT do (see
// below). Left unconfigured in that setup, selfOrigin() would compute
// "http://menu.example.com" while real browsers send
// "Origin: https://menu.example.com", so every legitimate state-changing
// admin request would be wrongly rejected as a cross-origin request.
//
// The fix is APP_ORIGIN, not `app.set('trust proxy', true)`. Blindly
// trusting every proxy hop would make Express also trust
// X-Forwarded-For/X-Forwarded-Host from whoever can reach it; if the
// Express process is ever reachable directly (not only through the
// intended proxy — a misconfigured security group, a debug port left
// open, etc.), an attacker could forge those headers themselves and
// manipulate exactly the value selfOrigin() computes, defeating Origin
// validation from the other direction. Nothing else in this app depends
// on `req.protocol`/`req.secure`/`req.ip` for a security decision (cookie
// `Secure` flags are driven by NODE_ENV, not by the request), so there is
// no reason to touch Express's trust-proxy setting in this phase at all.
//
// APP_ORIGIN, when set, is used as-is as the canonical public origin
// instead of deriving it from the request — no proxy trust required.
// Format: scheme + host only, no path/query/trailing slash (e.g.
// "https://menu.feelingwith.com"). Required in any production deployment
// that sits behind a reverse proxy; safely left unset for local
// development and for a production deployment that terminates TLS
// directly in this Node process.
const rawAppOrigin = (process.env.APP_ORIGIN || '').trim();
if (rawAppOrigin && !/^https?:\/\/[^/\s]+$/.test(rawAppOrigin)) {
  throw new Error(
    `Refusing to start: APP_ORIGIN ("${rawAppOrigin}") is not a bare scheme+host origin ` +
      '(e.g. "https://menu.feelingwith.com" — no path, query string, or trailing slash).'
  );
}

// Phase 05B: provider selection is environment-based by default — local
// disk in development (and test), Cloudinary in production — per the
// owner-approved decision (Phase 05A §4 / Phase 05B brief §2). STORAGE_
// PROVIDER, when explicitly set, still overrides this default either way
// (e.g. a production deployment that has its own persistent volume and
// wants to keep using local disk, or testing the cloud path locally).
const explicitStorageProvider = (process.env.STORAGE_PROVIDER || '').trim();
const defaultStorageProvider = nodeEnv === 'production' ? 'cloud' : 'local';
const resolvedStorageProvider = explicitStorageProvider || defaultStorageProvider;

module.exports = {
  nodeEnv,
  appOrigin: rawAppOrigin,
  port: parseInt(process.env.PORT || '4000', 10),

  // The production guard above has already thrown if this is unset in
  // production — the localhost default below is only ever actually used
  // in development/test.
  mongodbUri: required('MONGODB_URI', 'mongodb://localhost:27017/feeling_with_menu'),

  // Phase 05B (Atlas readiness): how long Mongoose waits to find a usable
  // server before giving up. Mongoose's own default (30s) is reasonable,
  // but leaving it unconfigured means a real Atlas outage/misconfiguration
  // hangs silently for 30s with no indication why; made explicit and
  // configurable so it can be tuned per-deployment without a code change.
  mongoServerSelectionTimeoutMs: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '10000', 10),

  // Phase 05B: Mongoose's own default is `true` in every environment,
  // which is fine for this project's current (small) collections, but is
  // conventionally disabled in production once a database is live — an
  // automatic index build at every process startup is unnecessary load
  // against a production database whose indexes already exist (declared
  // explicitly in each model) and were built once, deliberately. Overridable
  // via MONGOOSE_AUTO_INDEX for an operator who wants different behavior.
  mongooseAutoIndex:
    process.env.MONGOOSE_AUTO_INDEX !== undefined
      ? process.env.MONGOOSE_AUTO_INDEX === 'true'
      : nodeEnv !== 'production',

  // The unsafe default is reachable here only when nodeEnv !== 'production'
  // — the guard above has already thrown for any production process that
  // would otherwise have received it.
  jwtSecret: required('JWT_SECRET', UNSAFE_DEV_JWT_SECRET),
  jwtExpiresIn: required('JWT_EXPIRES_IN', '8h'),

  storageProvider: resolvedStorageProvider, // 'local' | 'cloud' (= Cloudinary)
  localUploadDir: required('LOCAL_UPLOAD_DIR', 'uploads'),

  // Code review fix #1 (CSRF Origin validation): optional comma-separated
  // list of additional origins to accept on state-changing admin requests,
  // for deployments where the admin dashboard is intentionally served from
  // a different, known origin than this API. Empty by default — the app is
  // same-origin by design in this phase (README, "CORS"), so the request's
  // own origin (scheme + host it was reached on) is always accepted and no
  // extra configuration is required for the common case.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Phase 05B: replaces the earlier, speculative S3-shaped CLOUD_STORAGE_*
  // placeholder names from Phase 01/02 — Cloudinary is now the actual,
  // owner-approved production provider (Phase 05A §4 recommendation,
  // approved in the Phase 05B brief), so the env vars name its real
  // credential shape instead of a generic one nothing implements yet.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    // Optional: groups this app's uploads under one Cloudinary folder
    // rather than the account root — harmless to leave unset.
    folder: process.env.CLOUDINARY_FOLDER || 'feeling-with-menu',
  },
};

module.exports.UNSAFE_DEV_JWT_SECRET = UNSAFE_DEV_JWT_SECRET;
