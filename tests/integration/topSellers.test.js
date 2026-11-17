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
let category;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  ({ server, origin } = await listen(app));
});

beforeEach(async () => {
  agent = request.agent(server);
  const admin = await createTestAdmin();
  ({ csrfToken } = await loginAsAdmin(agent, admin));
  category = await Category.create({ name: 'Hot Coffee', isVisible: true, isArchived: false });
});

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await disconnectTestDb();
  await closeServer(server);
});

// Manually-curated Top Sellers (owner-approved enhancement). Deliberately
// NOT a sales-analytics feature — these tests only prove the admin
// select/deselect/reorder endpoints persist correctly and that the public
// endpoint applies the exact same visibility rules as the rest of the
// public menu API.
describe('Admin Product — Top Sellers selection and ordering', () => {
  test('PATCH /:id/top-seller sets isTopSeller and persists it', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });

    const res = await agent
      .patch(`/api/admin/products/${product._id}/top-seller`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isTopSeller: true });

    expect(res.status).toBe(200);
    expect(res.body.product.isTopSeller).toBe(true);

    const reloaded = await Product.findById(product._id);
    expect(reloaded.isTopSeller).toBe(true);
  });

  test('PATCH /:id/top-seller can deselect (set back to false)', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id, isTopSeller: true });
    const res = await agent
      .patch(`/api/admin/products/${product._id}/top-seller`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isTopSeller: false });
    expect(res.status).toBe(200);
    expect(res.body.product.isTopSeller).toBe(false);
  });

  test('PATCH /:id/top-seller rejects a non-boolean value', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const res = await agent
      .patch(`/api/admin/products/${product._id}/top-seller`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isTopSeller: 'yes' });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id/top-seller-order persists the new order', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id, isTopSeller: true });
    const res = await agent
      .patch(`/api/admin/products/${product._id}/top-seller-order`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ topSellerOrder: 3 });
    expect(res.status).toBe(200);
    expect(res.body.product.topSellerOrder).toBe(3);
  });

  test('PATCH /:id/top-seller-order rejects a negative value', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const res = await agent
      .patch(`/api/admin/products/${product._id}/top-seller-order`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ topSellerOrder: -1 });
    expect(res.status).toBe(400);
  });

  test('a single product can never be "duplicated" as a Top Seller — selecting it twice is idempotent', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    await agent.patch(`/api/admin/products/${product._id}/top-seller`).set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ isTopSeller: true });
    const res = await agent.patch(`/api/admin/products/${product._id}/top-seller`).set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ isTopSeller: true });
    expect(res.status).toBe(200);

    const all = await Product.find({ _id: product._id });
    expect(all).toHaveLength(1); // still exactly one document — not duplicated
    expect(all[0].isTopSeller).toBe(true);
  });
});

describe('Public API — GET /api/menu/top-sellers', () => {
  test('returns only visible, non-archived Top Sellers, in ascending topSellerOrder', async () => {
    const a = await Product.create({ name: 'Second', price: 10, categoryId: category._id, isTopSeller: true, topSellerOrder: 1 });
    const b = await Product.create({ name: 'First', price: 20, categoryId: category._id, isTopSeller: true, topSellerOrder: 0 });
    await Product.create({ name: 'Not a top seller', price: 30, categoryId: category._id, isTopSeller: false });

    const res = await request(server).get('/api/menu/top-sellers');
    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name)).toEqual(['First', 'Second']);
    expect(res.body.products.map((p) => p.id)).toEqual([b._id.toString(), a._id.toString()]);
  });

  test('archived products never appear, even if flagged as a Top Seller', async () => {
    await Product.create({ name: 'Archived favorite', price: 10, categoryId: category._id, isTopSeller: true, isArchived: true });
    const res = await request(server).get('/api/menu/top-sellers');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  test('hidden products never appear, even if flagged as a Top Seller', async () => {
    await Product.create({ name: 'Hidden favorite', price: 10, categoryId: category._id, isTopSeller: true, isVisible: false });
    const res = await request(server).get('/api/menu/top-sellers');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  test('a Top Seller in a hidden category is excluded (category visibility cascades)', async () => {
    const hiddenCategory = await Category.create({ name: 'Seasonal', isVisible: false, isArchived: false });
    await Product.create({ name: 'In a hidden category', price: 10, categoryId: hiddenCategory._id, isTopSeller: true });
    const res = await request(server).get('/api/menu/top-sellers');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  test('an unavailable Top Seller is still returned, flagged (same rule as the regular menu, not hidden)', async () => {
    await Product.create({ name: 'Sold out favorite', price: 10, categoryId: category._id, isTopSeller: true, isAvailable: false });
    const res = await request(server).get('/api/menu/top-sellers');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].isAvailable).toBe(false);
  });

  test('returns an empty list, not an error, when no products are flagged as Top Sellers', async () => {
    await Product.create({ name: 'Ordinary product', price: 10, categoryId: category._id });
    const res = await request(server).get('/api/menu/top-sellers');
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });
});
