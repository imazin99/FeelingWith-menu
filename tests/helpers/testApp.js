const http = require('http');
const os = require('os');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const createApp = require('../../src/app');
const User = require('../../src/models/User');

// Integration-suite diagnosability fix (see tests/globalSetup.js for the
// matching globalSetup-side fix). `mongoose.connect(uri)` with no
// `serverSelectionTimeoutMS` defaults to a 30s server-selection window —
// if the mongod this URI points at never actually became reachable (even
// though globalSetup's own Promise resolved), `await connectTestDb()`
// would previously just sit there for up to 30s with zero diagnostic
// output, then whatever ran next (e.g. `categories.deleteMany()` in a
// `beforeEach`) would ALSO fail, confusingly, with its own unrelated
// "buffering timed out" error — exactly the pattern reported from
// Windows. A short, explicit timeout here fails fast with one clear,
// specific error instead of two confusing, seemingly-unrelated ones.
const CONNECT_TIMEOUT_MS = 8_000;

// Root cause of "MongooseServerSelectionError: Missing required
// sub-document 'driver' in the client metadata document" (confirmed via
// the installed dependency tree + mongodb/node-mongodb-native's own
// source, and matches Automattic/mongoose#16596): starting with the
// `mongodb` Node driver >=7.6.0 (pulled in transitively by
// mongoose@9.12.1's `mongodb: "~7.8"` dependency — confirmed installed
// here as mongodb@7.8.0), the driver builds its handshake client
// metadata by loading the `os` module through a dynamic `import('os')`
// (see node_modules/mongodb/lib/runtime_adapters.js). Jest's CommonJS
// test environment doesn't support that dynamic import, so it silently
// fails, the handshake is sent with incomplete/missing client metadata,
// and the MongoDB server (mongod, any version) rejects the connection
// with exactly this error — not a Windows-specific issue, not a mongod
// binary problem, and not fixed by retrying or changing timeouts (hence
// the identical error text across different ports/runs the user saw).
// This is a known regression, not yet fixed upstream in the driver
// (mongodb/node-mongodb-native#5059 / NODE-7832 was still open as of this
// writing). The driver itself exposes an escape hatch for exactly this:
// a `runtimeAdapters.os` connect option that supplies the `os` module
// directly instead of dynamically importing it, confirmed present in
// node_modules/mongodb/lib/connection_string.js and
// node_modules/mongodb/lib/runtime_adapters.js. Mongoose does not
// recognize `runtimeAdapters` as one of its own options, so it passes it
// straight through to the underlying `MongoClient`, unchanged.
const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
  runtimeAdapters: { os },
};

async function connectTestDb() {
  const uri = process.env.MONGODB_URI_TEST;
  if (!uri) {
    throw new Error(
      'MONGODB_URI_TEST is not set — did globalSetup (mongodb-memory-server) run? ' +
        'See jest.integration.config.js / tests/globalSetup.js.'
    );
  }
  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false); // fail fast on any query issued before/without a real connection, instead of silently queuing it and hitting mongoose's own separate buffering-timeout error later
  try {
    await mongoose.connect(uri, CONNECT_OPTIONS);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `\n[connectTestDb] Could not connect to the test MongoDB instance at ${uri} ` +
        `within ${CONNECT_TIMEOUT_MS / 1000}s. Original error:\n`
    );
    // eslint-disable-next-line no-console
    console.error(err && err.stack ? err.stack : err);
    throw err;
  }
}

async function disconnectTestDb() {
  // If connectTestDb() never actually succeeded, the connection is still
  // in its initial "disconnected" state (readyState 0) and
  // dropDatabase()/disconnect() would themselves throw a second,
  // unrelated error that only obscures the real one from
  // connectTestDb() — skip straight through in that case.
  //
  // Round 6 review fix: this previously skipped cleanup for ANY
  // readyState other than exactly 1 ("connected"), not just 0. That's
  // broader than intended — "connecting" (2) and "disconnecting" (3)
  // both still have a real underlying MongoClient with active
  // connection-monitoring timers (the driver's SDAM `Monitor`, which
  // reschedules itself via a plain, non-`unref`'d `setTimeout` —
  // confirmed in node_modules/mongodb/lib/sdam/monitor.js). Skipping
  // `mongoose.disconnect()` for those states would leave that MongoClient
  // — and its timers — running past the end of the test run, which is
  // one plausible contributor to Jest's "did not exit one second after
  // the test run has completed" warning. Only state 0 has nothing to
  // close at all.
  if (mongoose.connection.readyState === 0) return;
  try {
    await mongoose.connection.dropDatabase();
  } catch (err) {
    // Best-effort — still make sure the underlying MongoClient (and its
    // monitor timers) gets closed below even if dropping the database
    // itself failed for some reason.
    // eslint-disable-next-line no-console
    console.error('[disconnectTestDb] dropDatabase() failed (still disconnecting):', err && err.message);
  }
  await mongoose.disconnect();
}

async function clearCollections() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

async function createTestAdmin({ username = 'testadmin', password = 'password123' } = {}) {
  const passwordHash = await bcrypt.hash(password, 4); // low cost factor — tests only
  const user = await User.create({ username, passwordHash });
  return { user, username, password };
}

// Code review fix #1: requireCsrf now also validates the request's Origin
// against this server's own scheme+host (see src/middleware/csrf.js). A
// supertest call against a bare Express `app` object sends no Origin header
// at all and binds to a fresh ephemeral port on first use, so there's no
// fixed string to hardcode as "the" origin. Instead, every integration
// test file now binds its own real http.Server once (in beforeAll) via
// this helper, reads back the actual port it got, and uses
// `http://127.0.0.1:<that port>` as the Origin header on state-changing
// requests — i.e. tests exercise Origin validation exactly the way a real
// same-origin browser request would, rather than needing a special case
// to bypass it.
// Round 6 review fix (Jest open-handle investigation): `server.close()`
// alone stops the server from accepting *new* connections but, per
// Node's own docs, only resolves once every *existing* connection has
// ended on its own — it does not proactively end an HTTP/1.1 keep-alive
// socket a client (supertest's `agent(server)`) left open and idle.
// A real repro here (a bare http.Server + a keep-alive http.Agent +
// several requests) showed `close()` still resolving promptly in this
// environment, so this wasn't reproduced as the cause of the reported
// warning — but tracking and force-destroying any sockets that are
// still open at close time is the standard, zero-downside hardening for
// exactly this class of issue, and rules it out entirely rather than
// leaving it as a maybe. See tests/unit/testServerCleanup.test.js for a
// test proving close() stays fast even with a deliberately-held-open
// keep-alive connection.
function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    const sockets = new Set();
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.__openSockets = sockets;
    server.listen(0, '127.0.0.1', (err) => {
      if (err) return reject(err);
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (server.__openSockets) {
      // `socket.destroy()` itself is synchronous, but the socket's own
      // 'close' event (which removes it from the set) fires on a later
      // tick — clear the set immediately rather than waiting for that,
      // so callers can rely on it being empty as soon as this resolves.
      for (const socket of server.__openSockets) socket.destroy();
      server.__openSockets.clear();
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  createApp,
  connectTestDb,
  disconnectTestDb,
  clearCollections,
  createTestAdmin,
  listen,
  closeServer,
};
