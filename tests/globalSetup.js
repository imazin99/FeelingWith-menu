const { MongoMemoryServer } = require('mongodb-memory-server');
const singleton = require('./mongoMemoryServerSingleton');

// Integration-suite diagnosability fix. Previously this called
// `MongoMemoryServer.create()` with no try/catch and no explicit timeout.
// Two failure modes were both effectively invisible:
//
//   1. If `create()` rejects (binary download blocked, 403, DNS failure —
//      the sandbox's own known limitation, documented in README.md), the
//      *original* error (status code, URL, message) was not logged
//      anywhere before propagating, so whatever Jest prints for a failed
//      globalSetup is the only information available — often terse.
//   2. If the spawned `mongod` process hangs instead of cleanly rejecting
//      (observed on Windows — e.g. antivirus quarantining/scanning-locking
//      the extracted mongod.exe, a missing Visual C++ Redistributable
//      causing the process to spawn but never reach "waiting for
//      connections", or a local firewall silently dropping the loopback
//      bind), `create()` never resolves OR rejects at all. globalSetup has
//      no default timeout of its own, so Jest proceeds to run every test
//      file regardless, each of which then hangs in connectTestDb() until
//      ITS OWN timeout fires — the exact "30s timeout in beforeAll, then a
//      10s buffering timeout on the first query" pattern this is fixing.
//
// Fix: a hard, short-ish startup deadline via Promise.race (so a hang
// fails fast and deterministically, instead of masquerading as N separate
// per-suite timeouts with no shared cause), and the original error is
// always printed to stderr in full before this function rethrows —
// nothing is ever silently swallowed.
const STARTUP_TIMEOUT_MS = 45_000;

module.exports = async function globalSetup() {
  let mongod;
  try {
    mongod = await Promise.race([
      MongoMemoryServer.create(),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `MongoMemoryServer did not start within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
                  'The mongod process likely spawned but never became ready (common on ' +
                  'Windows: antivirus quarantining/locking the extracted mongod.exe, or a ' +
                  'missing Visual C++ Redistributable). It did not reject with its own ' +
                  'error, so there is nothing further to report from mongodb-memory-server ' +
                  'itself — see README.md, "Troubleshooting the integration suite on ' +
                  'Windows" for how to get a verbose log of the actual spawn failure.'
              )
            ),
          STARTUP_TIMEOUT_MS
        )
      ),
    ]);
  } catch (err) {
    // Always print the REAL error — download failures (DownloadError,
    // HTTP status, URL), spawn failures, or the timeout above — before it
    // propagates and fails the whole integration run. This is printed
    // with console.error (not thrown-and-hope) specifically so it is
    // visible even if the test runner's own globalSetup-failure reporting
    // truncates or reformats the thrown error.
    // eslint-disable-next-line no-console
    console.error('\n[globalSetup] MongoMemoryServer failed to start. Original error:\n');
    // eslint-disable-next-line no-console
    console.error(err && err.stack ? err.stack : err);
    // eslint-disable-next-line no-console
    console.error(
      '\n[globalSetup] The integration suite cannot run without a working MongoDB instance. ' +
        'See README.md, "Troubleshooting the integration suite on Windows", for diagnosis ' +
        'steps and a reliable workaround (MONGOMS_SYSTEM_BINARY pointing at a manually ' +
        'installed mongod).\n'
    );
    throw err;
  }

  singleton.set(mongod);
  process.env.MONGODB_URI_TEST = mongod.getUri();
};
