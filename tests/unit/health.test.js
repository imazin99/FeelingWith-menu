// Phase 05B: /health (liveness) and /ready (readiness) endpoints. These are
// pure unit tests against the Express app object via supertest — no real
// MongoDB connection is made. mongoose.connection.readyState is a plain,
// directly-settable property (confirmed by reading mongoose's own
// Connection class: it's a get/set pair that just stores the value and
// emits an event — not something only the driver can change), so the
// "database unavailable"/"database ready" branches are simulated by
// setting it directly, never by actually connecting to or disconnecting
// from a real database.
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../../src/app');

describe('GET /health', () => {
  const app = createApp();

  test('reports the process is alive, independent of database state', async () => {
    const originalState = mongoose.connection.readyState;
    mongoose.connection.readyState = 0; // disconnected
    try {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    } finally {
      mongoose.connection.readyState = originalState;
    }
  });

  test('never includes database/connection details', async () => {
    const res = await request(app).get('/health');
    expect(res.body).not.toHaveProperty('database');
    expect(res.body).not.toHaveProperty('mongodbUri');
  });
});

describe('GET /ready', () => {
  const app = createApp();
  const originalState = mongoose.connection.readyState;

  afterEach(() => {
    mongoose.connection.readyState = originalState;
  });

  test('returns 200 {status: "ready"} when the database is connected', async () => {
    mongoose.connection.readyState = 1; // connected

    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  test('returns 503 {status: "not_ready"} when the database is disconnected', async () => {
    mongoose.connection.readyState = 0; // disconnected

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', database: 'disconnected' });
  });

  test('returns 503 while the database is still connecting', async () => {
    mongoose.connection.readyState = 2; // connecting

    const res = await request(app).get('/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', database: 'connecting' });
  });

  test('never exposes a connection string, credentials, or any other infra detail', async () => {
    mongoose.connection.readyState = 0;

    const res = await request(app).get('/ready');

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/mongodb(\+srv)?:\/\//);
    expect(res.body).not.toHaveProperty('uri');
    expect(res.body).not.toHaveProperty('host');
  });
});
