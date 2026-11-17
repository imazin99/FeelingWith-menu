const request = require('supertest');
const { createApp, connectTestDb, disconnectTestDb, clearCollections } = require('../helpers/testApp');
const Category = require('../../src/models/Category');
const Product = require('../../src/models/Product');
const AddOn = require('../../src/models/AddOn');
const Settings = require('../../src/models/Settings');

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await disconnectTestDb();
});

// Architecture doc, section 1 & 7 — this is the core behavior the review
// cycle corrected: visibility and availability are independent, and a
// category's visibility/archive state cascades to its products.
describe('Public menu API filtering', () => {
  test('GET /api/menu/categories only returns visible, non-archived categories', async () => {
    await Category.create([
      { name: 'Hot Coffee', displayOrder: 0, isVisible: true, isArchived: false },
      { name: 'Hidden Category', displayOrder: 1, isVisible: false, isArchived: false },
      { name: 'Archived Category', displayOrder: 2, isVisible: true, isArchived: true },
    ]);

    const res = await request(app).get('/api/menu/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].name).toBe('Hot Coffee');
  });

  test('a hidden product is excluded entirely from the public response', async () => {
    const category = await Category.create({ name: 'Hot Coffee', displayOrder: 0 });
    await Product.create({ name: 'Latte', price: 50, categoryId: category._id, isVisible: false });
    await Product.create({ name: 'Espresso', price: 40, categoryId: category._id, isVisible: true });

    const res = await request(app).get('/api/menu/products');
    expect(res.status).toBe(200);
    const names = res.body.products.map((p) => p.name);
    expect(names).toEqual(['Espresso']);
  });

  test('an archived product is excluded entirely from the public response', async () => {
    const category = await Category.create({ name: 'Hot Coffee', displayOrder: 0 });
    await Product.create({ name: 'Discontinued Mocha', price: 55, categoryId: category._id, isArchived: true });

    const res = await request(app).get('/api/menu/products');
    expect(res.body.products).toHaveLength(0);
  });

  test('CORRECTED BEHAVIOR: an unavailable-but-visible product IS returned, flagged — never hidden', async () => {
    const category = await Category.create({ name: 'Hot Coffee', displayOrder: 0 });
    await Product.create({
      name: 'Caramel Macchiato',
      price: 60,
      categoryId: category._id,
      isVisible: true,
      isAvailable: false,
      isArchived: false,
    });

    const res = await request(app).get('/api/menu/products');
    expect(res.body.products).toHaveLength(1);
    expect(res.body.products[0].name).toBe('Caramel Macchiato');
    expect(res.body.products[0].isAvailable).toBe(false);
  });

  test('CASCADE: a hidden category excludes all of its products, regardless of each product\'s own flags', async () => {
    const hiddenCategory = await Category.create({ name: 'Seasonal', displayOrder: 0, isVisible: false });
    await Product.create({
      name: 'Pumpkin Spice Latte',
      price: 65,
      categoryId: hiddenCategory._id,
      isVisible: true,
      isAvailable: true,
      isArchived: false,
    });

    const res = await request(app).get('/api/menu/products');
    expect(res.body.products).toHaveLength(0);
  });

  test('CASCADE: an archived category excludes all of its products', async () => {
    const archivedCategory = await Category.create({ name: 'Old Menu', displayOrder: 0, isArchived: true });
    await Product.create({ name: 'Retired Drink', price: 30, categoryId: archivedCategory._id });

    const res = await request(app).get('/api/menu/products');
    expect(res.body.products).toHaveLength(0);
  });

  test('ADD-ONS: hidden add-ons are left out of a product\'s populated list entirely', async () => {
    const category = await Category.create({ name: 'Hot Coffee', displayOrder: 0 });
    const visibleAddOn = await AddOn.create({ name: 'Extra Shot', price: 10, isVisible: true });
    const hiddenAddOn = await AddOn.create({ name: 'Secret Syrup', price: 5, isVisible: false });
    await Product.create({
      name: 'Latte',
      price: 50,
      categoryId: category._id,
      addOnIds: [visibleAddOn._id, hiddenAddOn._id],
    });

    const res = await request(app).get('/api/menu/products');
    const addOnNames = res.body.products[0].addOns.map((a) => a.name);
    expect(addOnNames).toEqual(['Extra Shot']);
  });

  test('ADD-ONS: an unavailable-but-visible add-on is included and flagged (same rule as Products)', async () => {
    const category = await Category.create({ name: 'Hot Coffee', displayOrder: 0 });
    const addOn = await AddOn.create({ name: 'Oat Milk', price: 15, isVisible: true, isAvailable: false });
    await Product.create({ name: 'Latte', price: 50, categoryId: category._id, addOnIds: [addOn._id] });

    const res = await request(app).get('/api/menu/products');
    expect(res.body.products[0].addOns).toHaveLength(1);
    expect(res.body.products[0].addOns[0].isAvailable).toBe(false);
  });

  test('?category= filters products to one category, honoring the same cascade', async () => {
    const catA = await Category.create({ name: 'Hot Coffee', displayOrder: 0 });
    const catB = await Category.create({ name: 'Ice Coffee', displayOrder: 1 });
    await Product.create({ name: 'Latte', price: 50, categoryId: catA._id });
    await Product.create({ name: 'Iced Latte', price: 55, categoryId: catB._id });

    const res = await request(app).get(`/api/menu/products?category=${catA._id}`);
    expect(res.body.products.map((p) => p.name)).toEqual(['Latte']);
  });

  test('products are returned in displayOrder', async () => {
    const category = await Category.create({ name: 'Hot Coffee', displayOrder: 0 });
    await Product.create({ name: 'Second', price: 1, categoryId: category._id, displayOrder: 2 });
    await Product.create({ name: 'First', price: 1, categoryId: category._id, displayOrder: 1 });

    const res = await request(app).get('/api/menu/products');
    expect(res.body.products.map((p) => p.name)).toEqual(['First', 'Second']);
  });
});

// Code review fix #5: the approved Phase 01 document lists café name,
// tagline, logo, contact info, social links, language and RTL as
// public-facing, but no public route existed for them — only the admin-
// authenticated one did.
describe('Public Settings API (code review fix #5)', () => {
  test('GET /api/menu/settings requires no auth and returns only the public-safe whitelist', async () => {
    await Settings.getSingleton(); // ensure the singleton exists with defaults
    await Settings.findByIdAndUpdate(
      Settings.SINGLETON_ID,
      {
        cafeName: 'Feeling With',
        tagline: 'Warm cups, warmer moments',
        logoUrl: '/uploads/logo-abc123.png',
        logoKey: 'logo-abc123.png',
        contact: { phone: '+20 100 000 0000', email: 'hello@feelingwith.com' },
        socialLinks: { instagram: 'https://instagram.com/soltr_wear' },
        language: 'en',
        isRtl: false,
      },
      { new: true }
    );

    const res = await request(app).get('/api/menu/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.cafeName).toBe('Feeling With');
    expect(res.body.settings.tagline).toBe('Warm cups, warmer moments');
    expect(res.body.settings.logoUrl).toBe('/uploads/logo-abc123.png');
    expect(res.body.settings.contact.phone).toBe('+20 100 000 0000');
    expect(res.body.settings.socialLinks.instagram).toBe('https://instagram.com/soltr_wear');
    expect(res.body.settings.language).toBe('en');
    expect(res.body.settings.isRtl).toBe(false);
  });

  test('GET /api/menu/settings never exposes logoKey or internal document fields', async () => {
    await Settings.findByIdAndUpdate(
      Settings.SINGLETON_ID,
      { logoUrl: '/uploads/logo.png', logoKey: 'logo.png' },
      { upsert: true, new: true }
    );

    const res = await request(app).get('/api/menu/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.logoKey).toBeUndefined();
    expect(res.body.settings._id).toBeUndefined();
    expect(res.body.settings.createdAt).toBeUndefined();
    expect(res.body.settings.updatedAt).toBeUndefined();
    expect(res.body.settings.__v).toBeUndefined();
  });

  // Final review fix #1: the public endpoint must be strictly read-only.
  // The old behavior (Settings.getSingleton()) created and persisted a
  // document on first access, meaning an unauthenticated GET could write
  // to MongoDB — a violation of the public API's read-only architecture.
  test('GET /api/menu/settings returns safe defaults WITHOUT creating a Settings document when none exists', async () => {
    expect(await Settings.countDocuments()).toBe(0);

    const res = await request(app).get('/api/menu/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.cafeName).toBe('Feeling With');
    expect(res.body.settings.language).toBe('en');
    expect(res.body.settings.isRtl).toBe(false);

    // The defining assertion: still zero documents after the GET.
    expect(await Settings.countDocuments()).toBe(0);
  });

  test('calling GET /api/menu/settings repeatedly never creates a document', async () => {
    await request(app).get('/api/menu/settings');
    await request(app).get('/api/menu/settings');
    await request(app).get('/api/menu/settings');
    expect(await Settings.countDocuments()).toBe(0);
  });

  test('once an admin has initialized Settings, the public endpoint reads that same document (not a separate copy)', async () => {
    await Settings.getSingleton(); // simulates the admin-side GET /api/admin/settings
    await Settings.findByIdAndUpdate(Settings.SINGLETON_ID, { cafeName: 'Feeling With Café' });
    expect(await Settings.countDocuments()).toBe(1);

    const res = await request(app).get('/api/menu/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.cafeName).toBe('Feeling With Café');
    expect(await Settings.countDocuments()).toBe(1); // still exactly one — no extra doc created
  });
});
