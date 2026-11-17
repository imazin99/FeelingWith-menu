const request = require('supertest');
const { createApp, connectTestDb, disconnectTestDb, clearCollections, createTestAdmin, listen, closeServer } = require('../helpers/testApp');
const { loginAsAdmin } = require('../helpers/authHelper');
const Category = require('../../src/models/Category');
const Product = require('../../src/models/Product');

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

describe('Admin Category CRUD', () => {
  test('creates a category', async () => {
    const res = await agent.post('/api/admin/categories').set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ name: 'Smoothies' });
    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('Smoothies');
    expect(res.body.category.isVisible).toBe(true);
    expect(res.body.category.isArchived).toBe(false);
  });

  test('rejects a duplicate name (unique, case-insensitive)', async () => {
    await agent.post('/api/admin/categories').set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ name: 'Hot Coffee' });
    const res = await agent.post('/api/admin/categories').set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ name: 'hot coffee' });
    expect(res.status).toBe(409);
  });

  test('rejects a name shorter than 2 characters (validation)', async () => {
    const res = await agent.post('/api/admin/categories').set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ name: 'H' });
    expect(res.status).toBe(400);
  });

  test('lists all categories including hidden/archived (unlike the public endpoint)', async () => {
    const hidden = await Category.create({ name: 'Hidden', isVisible: false });
    await Category.create({ name: 'Visible', isVisible: true });

    const res = await agent.get('/api/admin/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(2);
    expect(res.body.categories.some((c) => c._id === hidden._id.toString())).toBe(true);
  });

  test('toggles visibility', async () => {
    const category = await Category.create({ name: 'Snacks' });
    const res = await agent
      .patch(`/api/admin/categories/${category._id}/visibility`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isVisible: false });
    expect(res.status).toBe(200);
    expect(res.body.category.isVisible).toBe(false);
  });

  test('archives and restores a category', async () => {
    const category = await Category.create({ name: 'Old' });
    const archiveRes = await agent
      .patch(`/api/admin/categories/${category._id}/archive`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isArchived: true });
    expect(archiveRes.body.category.isArchived).toBe(true);

    const restoreRes = await agent
      .patch(`/api/admin/categories/${category._id}/archive`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isArchived: false });
    expect(restoreRes.body.category.isArchived).toBe(false);
  });

  test('reorders a category', async () => {
    const category = await Category.create({ name: 'Snacks', displayOrder: 0 });
    const res = await agent
      .patch(`/api/admin/categories/${category._id}/reorder`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayOrder: 5 });
    expect(res.body.category.displayOrder).toBe(5);
  });

  test('404s for an operation on a non-existent category id', async () => {
    const fakeId = '64f0000000000000000000aa';
    const res = await agent.get(`/api/admin/categories/${fakeId}`);
    expect(res.status).toBe(404);
  });

  test('400s for a malformed category id', async () => {
    const res = await agent.get('/api/admin/categories/not-an-object-id');
    expect(res.status).toBe(400);
  });
});

test('categories/products left behind are cleared by afterEach', async () => {
  expect(await Category.countDocuments()).toBe(0);
  expect(await Product.countDocuments()).toBe(0);
});
