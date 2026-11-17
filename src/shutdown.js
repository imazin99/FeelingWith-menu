// Phase 05B: graceful shutdown. Extracted into its own, dependency-injected
// module (rather than written inline in server.js) specifically so it can
// be unit-tested by calling the returned handler function directly —
// sending real OS signals to the Jest process itself would be unsafe and
// unnecessary to prove this logic is correct.
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * @param {object} opts
 * @param {{close: Function}} opts.server - an http.Server (or anything
 *   with a Node-style close(callback) method).
 * @param {() => Promise<void>} opts.disconnectDB - closes the MongoDB
 *   connection; injected so tests can supply a mock instead of a real one.
 * @param {Console} [opts.log] - defaults to the real console; injectable so
 *   tests can assert on/ silence output.
 * @param {number} [opts.timeoutMs] - how long to wait for a clean shutdown
 *   before forcing exit.
 * @param {(code: number) => void} [opts.exit] - defaults to process.exit;
 *   MUST be overridden in tests (actually exiting would kill the test run).
 * @returns {(signal: string) => Promise<void>} a signal handler, safe to
 *   call more than once — every call after the first is a no-op.
 */
function createGracefulShutdown({ server, disconnectDB, log = console, timeoutMs = DEFAULT_TIMEOUT_MS, exit = process.exit }) {
  let shuttingDown = false;

  return async function shutdown(signal) {
    // Guards against duplicate/overlapping shutdown execution — e.g. a
    // process manager sending SIGTERM and then SIGINT moments later, or
    // the same signal arriving twice. Only the first call does anything.
    if (shuttingDown) return;
    shuttingDown = true;

    log.log(`Received ${signal}. Starting graceful shutdown...`);

    // If closing the server or the DB connection hangs (e.g. a request
    // handler that never resolves), don't let the process hang forever —
    // force exit after a bounded wait. unref() so this timer itself never
    // keeps the process alive if everything else finishes first.
    const forceExitTimer = setTimeout(() => {
      log.error(`Graceful shutdown did not complete within ${timeoutMs}ms — forcing exit.`);
      exit(1);
    }, timeoutMs);
    if (typeof forceExitTimer.unref === 'function') forceExitTimer.unref();

    // Stop accepting new connections; resolves once all in-flight requests
    // have finished (Node's documented http.Server#close behavior).
    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      log.log('HTTP server closed (no longer accepting new connections).');
    } catch (err) {
      log.error('Error while closing HTTP server:', err && err.message ? err.message : err);
    }

    try {
      await disconnectDB();
      log.log('MongoDB connection closed.');
    } catch (err) {
      log.error('Error while closing MongoDB connection:', err && err.message ? err.message : err);
    }

    clearTimeout(forceExitTimer);
    exit(0);
  };
}

module.exports = { createGracefulShutdown, DEFAULT_TIMEOUT_MS };
