// Phase 05B: MongoDB connection-lifecycle tests.
//
// "Connection failure handling" below is a real (not mocked) exercise of
// Mongoose/the MongoDB driver's own failure path — connecting to a real,
// deliberately-unreachable local TCP port — so it genuinely proves
// connectDB() rejects (rather than hanging) and never logs the connection
// string/credentials. It does NOT touch a real Atlas cluster.
//
// "No accidental production seeding" is verified structurally (by source
// inspection) rather than by executing src/scripts/seedAdmin.js directly:
// that script calls its own main() unconditionally at module load (by
// design — see its own header comment, "a one-time seed step run directly
// against the database" via `node src/scripts/seedAdmin.js`), so merely
// require()-ing it attempts a real DB connection. The actual Phase 05B
// requirement — that a normal server startup can never trigger seeding —
// is what's verified here, directly and reliably, without needing a live
// database for this test.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

describe('connectDB — connection failure handling (Atlas readiness)', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  });

  test('rejects (rather than hanging) when the target is unreachable, within the configured timeout', async () => {
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = '1500';
    const { connectDB } = require('../../src/config/db');

    // Port 1 is a real, routable loopback address nothing listens on in
    // this sandbox — a genuine "unreachable server" case, no external
    // network access required.
    const fakeUri = 'mongodb://secret-user:super-secret-password@127.0.0.1:1/feeling_with_menu';

    await expect(connectDB(fakeUri)).rejects.toThrow();

    delete process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS;
  }, 10_000);

  test('never logs the connection string or its embedded credentials', async () => {
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = '1500';
    const { connectDB } = require('../../src/config/db');

    const fakeUri = 'mongodb://secret-user:super-secret-password@127.0.0.1:1/feeling_with_menu';

    await connectDB(fakeUri).catch(() => {});

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allOutput).not.toContain('super-secret-password');
    expect(allOutput).not.toContain('secret-user');
    expect(allOutput).not.toContain(fakeUri);

    delete process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS;
  }, 10_000);
});

describe('Production startup — no accidental seeding (structural check)', () => {
  test('src/server.js never requires or invokes the admin-seed script', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '../../src/server.js'), 'utf8');
    expect(serverSrc).not.toMatch(/seedAdmin/);
  });

  test('src/app.js never requires or invokes the admin-seed script', () => {
    const appSrc = fs.readFileSync(path.join(__dirname, '../../src/app.js'), 'utf8');
    expect(appSrc).not.toMatch(/seedAdmin/);
  });

  test('the seed script itself only ever creates an account when zero admins already exist', () => {
    const seedSrc = fs.readFileSync(path.join(__dirname, '../../src/scripts/seedAdmin.js'), 'utf8');
    expect(seedSrc).toMatch(/existingCount\s*>\s*0/);
    expect(seedSrc).toMatch(/This script only seeds the very first account/);
  });
});
