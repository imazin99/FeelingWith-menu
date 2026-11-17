const createApp = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { getStorageProvider } = require('./services/storageProvider');
const { createGracefulShutdown } = require('./shutdown');
const env = require('./config/env');

async function start() {
  await connectDB();

  // Phase 05B (production-safety): fail fast at startup if the resolved
  // storage provider is misconfigured, rather than only discovering it on
  // the first real image upload a customer/owner triggers. Mirrors the
  // JWT_SECRET/MONGODB_URI startup guards in env.js — the constructor
  // itself validates its own required credentials and throws synchronously
  // if anything's missing.
  getStorageProvider();

  const app = createApp();
  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Feeling With Menu API listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = createGracefulShutdown({ server, disconnectDB });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { start };
