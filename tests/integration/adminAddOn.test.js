const request = require('supertest');
const { createApp, connectTestDb, disconnectTestDb, clearCollections, createTestAdmin, listen, closeServer } = require('../helpers/testApp');
const { loginAsAdmin } = require('../helpers/authHelper');
const AddOn = require('../../src/models/AddOn');

let app;
let server;
let origin;
let agent;
let csrfToken;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  ({ server, origin } = await listen(app));
});

beforeEach(async () => {
  agent = request.agent(server);
  const admin = await createTestAdmin();
  ({ csrfToken } = await loginAsAdmin(agent, admin));
});

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await disconnectTestDb();
  await closeServer(server);
});

describe('Admin AddOn CRUD (shared/reusable add-ons)', () => {
  test('creates an add-on', async () => {
    const res = await agent
      .post('/api/admin/addons')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Extra Shot', price: 10 });
    expect(res.status).toBe(201);
    expect(res.body.addOn.name).toBe('Extra Shot');
    expect(res.body.addOn.price).toBe(10);
  });

  test('rejects a duplicate add-on name (case-insensitive) — reusable list must not silently duplicate', async () => {
    await agent.post('/api/admin/addons').set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ name: 'Oat Milk', price: 15 });
    const res = await agent
      .post('/api/admin/addons')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'oat milk', price: 20 });
    expect(res.status).toBe(409);
  });

  test('rejects a negative price', async () => {
    const res = await agent
      .post('/api/admin/addons')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Free Thing', price: -5 });
    expect(res.status).toBe(400);
  });

  test('toggles visibility and availability independently', async () => {
    const addOn = await AddOn.create({ name: 'Vanilla Syrup', price: 8 });

    const availRes = await agent
      .patch(`/api/admin/addons/${addOn._id}/availability`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isAvailable: false });
    expect(availRes.body.addOn.isAvailable).toBe(false);
    expect(availRes.body.addOn.isVisible).toBe(true); // unaffected — independent flags

    const visRes = await agent
      .patch(`/api/admin/addons/${addOn._id}/visibility`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isVisible: false });
    expect(visRes.body.addOn.isVisible).toBe(false);
    expect(visRes.body.addOn.isAvailable).toBe(false); // stays as previously set
  });

  test('archives an add-on', async () => {
    const addOn = await AddOn.create({ name: 'Caramel Drizzle', price: 7 });
    const res = await agent
      .patch(`/api/admin/addons/${addOn._id}/archive`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isArchived: true });
    expect(res.body.addOn.isArchived).toBe(true);
  });
});
