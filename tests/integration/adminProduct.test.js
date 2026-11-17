const fs = require('fs');
const path = require('path');
const os = require('os');

// Round 6 review fix: this MUST run before the `require('../helpers/testApp')`
// below. src/config/env.js reads LOCAL_UPLOAD_DIR exactly once, at its own
// require time, and every other module here requires it transitively
// (testApp -> src/app -> src/config/env). Setting this inside beforeAll
// (as it previously was) ran far too late — by then env.js had already
// computed and frozen `localUploadDir` from whatever LOCAL_UPLOAD_DIR was
// (or wasn't) set to before this file's very first `require` below ever
// executed. The upload endpoint still responded 200 with a real
// imageKey — it had just written the file to the real ./uploads
// directory instead of this test's isolated tmp directory — so only the
// final `fs.existsSync(path.join(tmpUploadDir, ...))` assertions failed,
// which is exactly the two failures reported ("uploads a valid JPEG..."
// and "replacing an image deletes the OLD file..."). This is a test
// module-load-order bug, not a storage/upload implementation bug or a
// Windows-specific issue — it would reproduce identically on any OS.
const tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwm-product-image-test-'));
process.env.LOCAL_UPLOAD_DIR = tmpUploadDir;

const request = require('supertest');
const { createApp, connectTestDb, disconnectTestDb, clearCollections, createTestAdmin, listen, closeServer } = require('../helpers/testApp');
const { loginAsAdmin } = require('../helpers/authHelper');
const Category = require('../../src/models/Category');
const AddOn = require('../../src/models/AddOn');
const Product = require('../../src/models/Product');

let app;
let server;
let origin;
let agent;
let csrfToken;
let category;

// A minimal valid JPEG byte sequence (SOI marker + a little payload) —
// enough to pass the magic-byte sniff without needing a real photo file.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const NOT_AN_IMAGE = Buffer.from('this is definitely not an image, just text bytes');

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  ({ server, origin } = await listen(app));
});

beforeEach(async () => {
  agent = request.agent(server);
  const admin = await createTestAdmin();
  ({ csrfToken } = await loginAsAdmin(agent, admin));
  category = await Category.create({ name: 'Hot Coffee' });
});

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await disconnectTestDb();
  await closeServer(server);
  fs.rmSync(tmpUploadDir, { recursive: true, force: true });
  delete process.env.LOCAL_UPLOAD_DIR;
});

describe('Admin Product CRUD', () => {
  test('creates a product referencing a category', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', price: 50, categoryId: category._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe('Latte');
    expect(res.body.product.categoryId).toBe(category._id.toString());
  });

  test('rejects a product referencing a non-existent category', async () => {
    const fakeCategoryId = '64f0000000000000000000aa';
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', price: 50, categoryId: fakeCategoryId });
    expect(res.status).toBe(400);
  });

  test('toggles visibility, availability and archived independently (not interchangeable)', async () => {
    const product = await Product.create({ name: 'Mocha', price: 55, categoryId: category._id });

    const availRes = await agent
      .patch(`/api/admin/products/${product._id}/availability`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ isAvailable: false });
    expect(availRes.body.product.isAvailable).toBe(false);
    expect(availRes.body.product.isVisible).toBe(true);
    expect(availRes.body.product.isArchived).toBe(false);
  });
});

// Regression: PUT /api/admin/products/:id (updateProduct) previously
// silently dropped `displayOrder` from the request body — the Edit Product
// form exposes this field, but the handler never read or assigned it, so
// edits to a product's order via the edit form never persisted. Fixed to
// read, validate (non-negative integer, same rule as createProduct and the
// reorder endpoint) and assign `displayOrder` before saving.
describe('Admin Product — displayOrder on PUT /api/admin/products/:id (regression)', () => {
  test('updating an existing product\'s displayOrder persists the new value', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id, displayOrder: 0 });

    const res = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayOrder: 5 });

    expect(res.status).toBe(200);
    expect(res.body.product.displayOrder).toBe(5);

    const reloaded = await Product.findById(product._id);
    expect(reloaded.displayOrder).toBe(5);
  });

  test('an order-only update does not affect other product fields', async () => {
    const product = await Product.create({
      name: 'Latte',
      description: 'Smooth and creamy',
      price: 5000,
      categoryId: category._id,
      displayOrder: 2,
      isVisible: true,
      isAvailable: true,
    });

    const res = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayOrder: 9 });

    expect(res.status).toBe(200);
    expect(res.body.product.displayOrder).toBe(9);
    expect(res.body.product.name).toBe('Latte');
    expect(res.body.product.description).toBe('Smooth and creamy');
    expect(res.body.product.price).toBe(5000);
    expect(res.body.product.categoryId).toBe(category._id.toString());
    expect(res.body.product.isVisible).toBe(true);
    expect(res.body.product.isAvailable).toBe(true);
  });

  test('rejects a negative displayOrder', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const res = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayOrder: -1 });
    expect(res.status).toBe(400);
  });

  test('rejects a non-integer (decimal) displayOrder', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const res = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayOrder: 2.5 });
    expect(res.status).toBe(400);
  });

  test('the public products API returns products in ascending displayOrder after an edit-form reorder', async () => {
    const first = await Product.create({ name: 'First', price: 10, categoryId: category._id, displayOrder: 0 });
    const second = await Product.create({ name: 'Second', price: 20, categoryId: category._id, displayOrder: 1 });

    // Swap their order the same way the Edit Product form would: a PUT
    // with just displayOrder changed.
    await agent
      .put(`/api/admin/products/${first._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayOrder: 5 });
    await agent
      .put(`/api/admin/products/${second._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayOrder: 1 });

    const res = await request(server).get('/api/menu/products');
    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name)).toEqual(['Second', 'First']);
  });
});

// Pricing decision (approved, code review round 2 — fix #6): fixed price OR
// variant pricing, never both; each variant has its own required, integer,
// non-negative price (piastres) — no priceModifier.
describe('Admin Product pricing modes (fixed vs. variant — code review fix #6)', () => {
  test('creates a fixed-price product with no variants', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', price: 5000, categoryId: category._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.product.price).toBe(5000);
    expect(res.body.product.variants).toHaveLength(0);
  });

  test('a fixed price of exactly 0 is allowed (final review fix #2)', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Free Sample', price: 0, categoryId: category._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.product.price).toBe(0);
  });

  test('rejects a negative fixed price (final review fix #2)', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', price: -100, categoryId: category._id.toString() });
    expect(res.status).toBe(400);
  });

  test('rejects a non-integer (decimal) fixed price (final review fix #2)', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', price: 49.99, categoryId: category._id.toString() });
    expect(res.status).toBe(400);
  });

  test('PUT also rejects a decimal fixed price on an existing product (final review fix #2)', async () => {
    const product = await Product.create({ name: 'Latte', price: 5000, categoryId: category._id });
    const res = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ price: 49.99 });
    expect(res.status).toBe(400);
  });

  test('creates a variant-priced product with independent prices per variant, and no top-level price', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({
        name: 'Latte',
        categoryId: category._id.toString(),
        variants: [
          { name: 'Small', price: 5000 },
          { name: 'Medium', price: 6500 },
          { name: 'Large', price: 8000 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.product.variants).toHaveLength(3);
    expect(res.body.product.variants.map((v) => v.price)).toEqual([5000, 6500, 8000]);
    expect(res.body.product.variants[1].name).toBe('Medium');
    expect(res.body.product.price == null).toBe(true); // undefined or null — never set
  });

  test('a variant price of exactly 0 is allowed (free variant)', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Water', categoryId: category._id.toString(), variants: [{ name: 'Cup', price: 0 }] });
    expect(res.status).toBe(201);
    expect(res.body.product.variants[0].price).toBe(0);
  });

  test('rejects a negative variant price', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', categoryId: category._id.toString(), variants: [{ name: 'Small', price: -100 }] });
    expect(res.status).toBe(400);
  });

  test('rejects a non-integer (decimal) variant price', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', categoryId: category._id.toString(), variants: [{ name: 'Small', price: 50.5 }] });
    expect(res.status).toBe(400);
  });

  test('rejects a product with BOTH a fixed price and variants (invalid combination)', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({
        name: 'Latte',
        price: 5000,
        categoryId: category._id.toString(),
        variants: [{ name: 'Small', price: 5000 }],
      });
    expect(res.status).toBe(400);
  });

  test('rejects a product with NEITHER a fixed price nor any variants (invalid combination)', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', categoryId: category._id.toString() });
    expect(res.status).toBe(400);
  });

  test('rejects a variant with no price at all', async () => {
    const res = await agent
      .post('/api/admin/products')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Latte', categoryId: category._id.toString(), variants: [{ name: 'Small' }] });
    expect(res.status).toBe(400);
  });

  test('PUT switching a fixed-price product to variant pricing requires explicitly clearing price', async () => {
    const product = await Product.create({ name: 'Latte', price: 5000, categoryId: category._id });

    // Sending variants without also clearing price is rejected — switching
    // pricing modes is explicit, never inferred.
    const rejected = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ variants: [{ name: 'Small', price: 5000 }] });
    expect(rejected.status).toBe(400);

    const accepted = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ price: null, variants: [{ name: 'Small', price: 5000 }, { name: 'Large', price: 7000 }] });
    expect(accepted.status).toBe(200);
    expect(accepted.body.product.variants).toHaveLength(2);
    expect(accepted.body.product.price == null).toBe(true);
  });

  test('PUT switching a variant-priced product back to fixed pricing requires explicitly clearing variants', async () => {
    const product = await Product.create({
      name: 'Latte',
      categoryId: category._id,
      variants: [{ name: 'Small', price: 5000 }],
    });

    const rejected = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ price: 6000 });
    expect(rejected.status).toBe(400);

    const accepted = await agent
      .put(`/api/admin/products/${product._id}`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ price: 6000, variants: [] });
    expect(accepted.status).toBe(200);
    expect(accepted.body.product.price).toBe(6000);
    expect(accepted.body.product.variants).toHaveLength(0);
  });

  test('the public menu API returns each variant\'s independent price, never a priceModifier', async () => {
    await Product.create({
      name: 'Latte',
      categoryId: category._id,
      variants: [{ name: 'Small', price: 5000 }, { name: 'Large', price: 8000 }],
    });

    const res = await request(server).get('/api/menu/products');
    expect(res.status).toBe(200);
    const variant = res.body.products[0].variants[0];
    expect(variant.price).toBe(5000);
    expect(variant.priceModifier).toBeUndefined();
  });
});

describe('Admin Product add-on attachment (shared AddOns collection)', () => {
  test('attaches reusable add-ons to a product by reference', async () => {
    const addOn1 = await AddOn.create({ name: 'Extra Shot', price: 10 });
    const addOn2 = await AddOn.create({ name: 'Oat Milk', price: 15 });
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });

    const res = await agent
      .post(`/api/admin/products/${product._id}/addons`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ addOnIds: [addOn1._id.toString(), addOn2._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.product.addOnIds).toHaveLength(2);
    // populated, so they come back as full objects, not bare ids
    expect(res.body.product.addOnIds.map((a) => a.name).sort()).toEqual(['Extra Shot', 'Oat Milk']);
  });

  test('rejects attaching a non-existent add-on id', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const fakeAddOnId = '64f0000000000000000000bb';

    const res = await agent
      .post(`/api/admin/products/${product._id}/addons`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ addOnIds: [fakeAddOnId] });
    expect(res.status).toBe(400);
  });

  test('the same add-on can be attached to two different products (reusability)', async () => {
    const sharedAddOn = await AddOn.create({ name: 'Vanilla Syrup', price: 8 });
    const productA = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const productB = await Product.create({ name: 'Cappuccino', price: 48, categoryId: category._id });

    await agent
      .post(`/api/admin/products/${productA._id}/addons`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ addOnIds: [sharedAddOn._id.toString()] });
    await agent
      .post(`/api/admin/products/${productB._id}/addons`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ addOnIds: [sharedAddOn._id.toString()] });

    const addOnCount = await AddOn.countDocuments({ name: /vanilla syrup/i });
    expect(addOnCount).toBe(1); // defined once, attached twice — not duplicated
  });
});

describe('Admin Product image upload (section 5: storage abstraction, validation, replacement cleanup)', () => {
  test('uploads a valid JPEG and sets imageUrl/imageKey on the product', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });

    const res = await agent
      .post(`/api/admin/products/${product._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'photo.jpg');

    expect(res.status).toBe(200);
    expect(res.body.product.imageUrl).toMatch(/^\/uploads\//);
    expect(res.body.product.imageKey).toBeTruthy();

    const filePath = path.join(tmpUploadDir, res.body.product.imageKey);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('rejects a disguised non-image file even with a .jpg-looking request (magic-byte sniff)', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });

    const res = await agent
      .post(`/api/admin/products/${product._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', NOT_AN_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
  });

  test('replacing an image deletes the OLD file only after the new one is saved (never leaves the product imageless)', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });

    const first = await agent
      .post(`/api/admin/products/${product._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'first.jpg');
    const firstKey = first.body.product.imageKey;
    const firstPath = path.join(tmpUploadDir, firstKey);
    expect(fs.existsSync(firstPath)).toBe(true);

    const second = await agent
      .post(`/api/admin/products/${product._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'second.jpg');
    const secondKey = second.body.product.imageKey;

    expect(secondKey).not.toBe(firstKey);
    expect(fs.existsSync(path.join(tmpUploadDir, secondKey))).toBe(true); // new file present
    expect(fs.existsSync(firstPath)).toBe(false); // old file cleaned up after success
  });

  test('rejects an upload with no file attached', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const res = await agent.post(`/api/admin/products/${product._id}/image`).set('X-CSRF-Token', csrfToken).set('Origin', origin);
    expect(res.status).toBe(400);
  });

  // Final review — multer error handling: an unsupported MIME type is
  // rejected by multer's own fileFilter (src/middleware/upload.js) before
  // the request body is ever fully read, and must come back as a clean
  // 400 — not the 500 it fell through to before this fix.
  test('rejects an unsupported MIME type (e.g. a PDF) with 400 and no leaked internals', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const res = await agent
      .post(`/api/admin/products/${product._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', Buffer.from('%PDF-1.4 fake pdf bytes'), { filename: 'menu.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: expect.stringMatching(/unsupported image format/i) } });
    expect(res.body.error.stack).toBeUndefined();
  });

  // A file-size-limit violation is thrown by Multer itself (not our
  // fileFilter) and must come back as 413, not 500.
  test('rejects a file exceeding the 5 MB limit with 413 and a fixed, safe message', async () => {
    const product = await Product.create({ name: 'Latte', price: 50, categoryId: category._id });
    const oversized = Buffer.concat([FAKE_JPEG, Buffer.alloc(5 * 1024 * 1024 + 1024, 0)]); // > MAX_BYTES

    const res = await agent
      .post(`/api/admin/products/${product._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', oversized, 'huge.jpg');

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { message: 'File is too large. Maximum size is 5 MB.' } });
  });
});
