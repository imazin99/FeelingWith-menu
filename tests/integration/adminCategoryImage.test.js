const fs = require('fs');
const path = require('path');
const os = require('os');

// Same module-load-order requirement as adminProduct.test.js's own image
// tests: src/config/env.js reads LOCAL_UPLOAD_DIR once, at its own
// require time, so this MUST be set before requiring '../helpers/testApp'
// below (which transitively requires src/config/env).
const tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwm-category-image-test-'));
process.env.LOCAL_UPLOAD_DIR = tmpUploadDir;

const request = require('supertest');
const { createApp, connectTestDb, disconnectTestDb, clearCollections, createTestAdmin, listen, closeServer } = require('../helpers/testApp');
const { loginAsAdmin } = require('../helpers/authHelper');
const Category = require('../../src/models/Category');

let app;
let server;
let origin;
let agent;
let csrfToken;

// Same minimal valid JPEG byte sequence used by adminProduct.test.js's
// image tests — enough to pass the magic-byte sniff.
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

// Independent category images (owner-approved enhancement) — same
// storage-provider abstraction, magic-byte validation, and
// save-then-cleanup convention as the existing product image upload
// tests above, plus the new DELETE .../image (remove) endpoint, which
// has no product-side precedent.
describe('Admin Category image upload/replace/remove', () => {
  test('uploads a valid JPEG and sets imageUrl/imageKey on the category', async () => {
    const category = await Category.create({ name: 'Hot Coffee' });

    const res = await agent
      .post(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'photo.jpg');

    expect(res.status).toBe(200);
    expect(res.body.category.imageUrl).toMatch(/^\/uploads\//);
    expect(res.body.category.imageKey).toBeTruthy();
    expect(fs.existsSync(path.join(tmpUploadDir, res.body.category.imageKey))).toBe(true);
  });

  test('rejects a disguised non-image file even with a .jpg-looking request (magic-byte sniff)', async () => {
    const category = await Category.create({ name: 'Hot Coffee' });
    const res = await agent
      .post(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', NOT_AN_IMAGE, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });

  test('rejects an upload with no file attached', async () => {
    const category = await Category.create({ name: 'Hot Coffee' });
    const res = await agent
      .post(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin);
    expect(res.status).toBe(400);
  });

  test('replacing an image deletes the OLD file only after the new one is saved (never leaves the category imageless)', async () => {
    const category = await Category.create({ name: 'Hot Coffee' });

    const first = await agent
      .post(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'first.jpg');
    const firstPath = path.join(tmpUploadDir, first.body.category.imageKey);
    expect(fs.existsSync(firstPath)).toBe(true);

    const second = await agent
      .post(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'second.jpg');

    expect(second.body.category.imageKey).not.toBe(first.body.category.imageKey);
    expect(fs.existsSync(path.join(tmpUploadDir, second.body.category.imageKey))).toBe(true);
    expect(fs.existsSync(firstPath)).toBe(false); // old file cleaned up after success
  });

  test('DELETE .../image removes the image and deletes the stored file', async () => {
    const category = await Category.create({ name: 'Hot Coffee' });
    const upload = await agent
      .post(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'photo.jpg');
    const storedPath = path.join(tmpUploadDir, upload.body.category.imageKey);
    expect(fs.existsSync(storedPath)).toBe(true);

    const res = await agent
      .delete(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin);

    expect(res.status).toBe(200);
    expect(res.body.category.imageUrl).toBeFalsy();
    expect(res.body.category.imageKey).toBeFalsy();
    expect(fs.existsSync(storedPath)).toBe(false);

    const reloaded = await Category.findById(category._id);
    expect(reloaded.imageUrl).toBeFalsy();
  });

  test('DELETE .../image on a category with no image is a safe no-op', async () => {
    const category = await Category.create({ name: 'Hot Coffee' });
    const res = await agent
      .delete(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin);
    expect(res.status).toBe(200);
  });

  test('the public category response exposes imageUrl but never imageKey', async () => {
    const category = await Category.create({ name: 'Hot Coffee', isVisible: true, isArchived: false });
    await agent
      .post(`/api/admin/categories/${category._id}/image`)
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .attach('image', FAKE_JPEG, 'photo.jpg');

    const res = await request(server).get('/api/menu/categories');
    expect(res.status).toBe(200);
    const publicCategory = res.body.categories.find((c) => c.id === category._id.toString());
    expect(publicCategory.imageUrl).toMatch(/^\/uploads\//);
    expect(publicCategory.imageKey).toBeUndefined();
  });
});
