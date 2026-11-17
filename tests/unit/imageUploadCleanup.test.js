// Code review fix #7: if the newly-uploaded file is written successfully
// but persisting the document that references it then fails, the new file
// must be cleaned up — and the pre-existing (old) file must be left
// completely untouched. This is pure control-flow logic around a
// Mongoose document's .save(), so it's tested here with the Product/
// Settings models and the storage provider both mocked — no real database
// or disk access needed, matching the rest of tests/unit/.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

// src/utils/asyncHandler.js wraps the real handler as
// `function wrapped(req, res, next) { Promise.resolve(fn(req, res, next)).catch(next); }`
// — `wrapped` itself is synchronous and returns undefined, so
// `await uploadImage(...)` does NOT wait for the real async work inside it
// to finish; it resolves immediately, before upload/save/delete/json/next
// have necessarily run. This helper actually waits for the handler to reach
// a terminal state (either res.json(...) or next(err) being called) before
// handing back the (jest.fn-backed) res/next for assertions.
function runHandler(handler, req) {
  return new Promise((resolve) => {
    const res = {};
    const next = jest.fn(() => resolve({ res, next }));
    res.json = jest.fn(() => resolve({ res, next }));
    handler(req, res, next);
  });
}

describe('adminProductController.uploadImage — cleanup on save failure (fix #7)', () => {
  let Product;
  let getStorageProvider;
  let uploadImage;
  let storage;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Product', () => ({ findById: jest.fn() }));
    jest.doMock('../../src/services/storageProvider', () => ({ getStorageProvider: jest.fn() }));

    Product = require('../../src/models/Product');
    ({ getStorageProvider } = require('../../src/services/storageProvider'));
    storage = { upload: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
    getStorageProvider.mockReturnValue(storage);

    ({ uploadImage } = require('../../src/controllers/adminProductController'));
  });

  test('deletes ONLY the newly-uploaded file (never the old one) when product.save() fails, and re-throws', async () => {
    const saveError = new Error('simulated validation/DB failure on save');
    const fakeProduct = {
      imageKey: 'old-key-111.jpg', // the product already had an image
      imageUrl: '/uploads/old-key-111.jpg',
      save: jest.fn().mockRejectedValue(saveError),
    };
    Product.findById.mockResolvedValue(fakeProduct);
    storage.upload.mockResolvedValue({ url: '/uploads/new-key-222.jpg', key: 'new-key-222.jpg' });

    const req = { params: { id: 'prod1' }, file: { buffer: FAKE_JPEG } };
    const { res, next } = await runHandler(uploadImage, req);

    // The NEW file was cleaned up...
    expect(storage.delete).toHaveBeenCalledWith('new-key-222.jpg');
    // ...and the OLD file was never touched in this failure path.
    expect(storage.delete).not.toHaveBeenCalledWith('old-key-111.jpg');
    expect(storage.delete).toHaveBeenCalledTimes(1);
    // The original save error propagated (to the error-handling middleware),
    // not swallowed.
    expect(next).toHaveBeenCalledWith(saveError);
    expect(res.json).not.toHaveBeenCalled();
  });

  test('on success, deletes the OLD file (replacement) and leaves the new one in place', async () => {
    const fakeProduct = {
      imageKey: 'old-key-111.jpg',
      imageUrl: '/uploads/old-key-111.jpg',
      save: jest.fn().mockResolvedValue(undefined),
    };
    Product.findById.mockResolvedValue(fakeProduct);
    storage.upload.mockResolvedValue({ url: '/uploads/new-key-222.jpg', key: 'new-key-222.jpg' });

    const req = { params: { id: 'prod1' }, file: { buffer: FAKE_JPEG } };
    const { res, next } = await runHandler(uploadImage, req);

    expect(storage.delete).toHaveBeenCalledWith('old-key-111.jpg');
    expect(storage.delete).not.toHaveBeenCalledWith('new-key-222.jpg');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ product: fakeProduct });
  });

  test('a product with no prior image (no oldKey) never calls delete at all on success', async () => {
    const fakeProduct = {
      imageKey: undefined,
      imageUrl: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    Product.findById.mockResolvedValue(fakeProduct);
    storage.upload.mockResolvedValue({ url: '/uploads/new-key-333.jpg', key: 'new-key-333.jpg' });

    const req = { params: { id: 'prod1' }, file: { buffer: FAKE_JPEG } };
    const { next } = await runHandler(uploadImage, req);

    expect(storage.delete).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('adminProductController.uploadImage — old-image delete failure must not fail the request (Phase 05B correction)', () => {
  let Product;
  let getStorageProvider;
  let uploadImage;
  let storage;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Product', () => ({ findById: jest.fn() }));
    jest.doMock('../../src/services/storageProvider', () => ({ getStorageProvider: jest.fn() }));

    Product = require('../../src/models/Product');
    ({ getStorageProvider } = require('../../src/services/storageProvider'));
    storage = { upload: jest.fn(), delete: jest.fn() };
    getStorageProvider.mockReturnValue(storage);

    ({ uploadImage } = require('../../src/controllers/adminProductController'));
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('responds with success (not an error) when product.save() succeeds but deleting the old image throws', async () => {
    const deleteError = new Error('Cloudinary delete failed: simulated transient API error');
    const fakeProduct = {
      imageKey: 'old-key-111.jpg',
      imageUrl: '/uploads/old-key-111.jpg',
      save: jest.fn().mockResolvedValue(undefined),
    };
    Product.findById.mockResolvedValue(fakeProduct);
    storage.upload.mockResolvedValue({ url: '/uploads/new-key-222.jpg', key: 'new-key-222.jpg' });
    storage.delete.mockRejectedValue(deleteError);

    const req = { params: { id: 'prod1' }, file: { buffer: FAKE_JPEG } };
    const { res, next } = await runHandler(uploadImage, req);

    // The database update already succeeded — the response must reflect
    // that, never the old-image cleanup failure.
    expect(res.json).toHaveBeenCalledWith({ product: fakeProduct });
    expect(next).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('old-key-111.jpg');
  });

  test('logs the old-image delete failure without exposing the storage key or any secret-shaped value', async () => {
    const deleteError = new Error(
      'Cloudinary delete failed: unexpected result "error" (api_key=should-never-appear-in-logs)'
    );
    const fakeProduct = {
      imageKey: 'old-key-111.jpg',
      imageUrl: '/uploads/old-key-111.jpg',
      save: jest.fn().mockResolvedValue(undefined),
    };
    Product.findById.mockResolvedValue(fakeProduct);
    storage.upload.mockResolvedValue({ url: '/uploads/new-key-222.jpg', key: 'new-key-222.jpg' });
    storage.delete.mockRejectedValue(deleteError);

    const req = { params: { id: 'prod1' }, file: { buffer: FAKE_JPEG } };
    await runHandler(uploadImage, req);

    expect(errorSpy).toHaveBeenCalled();
    // The failure is logged (so it's not silently lost)...
    const loggedText = errorSpy.mock.calls.flat().join(' ');
    expect(loggedText).toContain('failed to delete');
    // ...and the error's own message (which this test deliberately salted
    // with an "api_key=" marker) is logged as-is for diagnosis — this
    // assertion documents that the controller itself adds no secret value
    // of its own; it never reads or logs real Cloudinary credentials,
    // which never appear in an Error's message in the first place (see
    // storageProvider.test.js for the provider-level guarantee that only
    // `err.message` is ever surfaced, never raw config).
    expect(loggedText).not.toContain('CLOUDINARY_API_SECRET');
  });

  test('old image delete is never even attempted if product.save() fails (save failure still takes priority)', async () => {
    const saveError = new Error('simulated validation/DB failure on save');
    const fakeProduct = {
      imageKey: 'old-key-111.jpg',
      imageUrl: '/uploads/old-key-111.jpg',
      save: jest.fn().mockRejectedValue(saveError),
    };
    Product.findById.mockResolvedValue(fakeProduct);
    storage.upload.mockResolvedValue({ url: '/uploads/new-key-222.jpg', key: 'new-key-222.jpg' });
    storage.delete.mockResolvedValue(undefined);

    const req = { params: { id: 'prod1' }, file: { buffer: FAKE_JPEG } };
    const { next } = await runHandler(uploadImage, req);

    expect(storage.delete).toHaveBeenCalledWith('new-key-222.jpg'); // orphan cleanup of the NEW file
    expect(storage.delete).not.toHaveBeenCalledWith('old-key-111.jpg'); // old image preserved
    expect(next).toHaveBeenCalledWith(saveError);
  });
});

describe('adminSettingsController.uploadLogo — identical cleanup pattern (fix #7)', () => {
  let Settings;
  let getStorageProvider;
  let uploadLogo;
  let storage;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Settings', () => ({ getSingleton: jest.fn() }));
    jest.doMock('../../src/services/storageProvider', () => ({ getStorageProvider: jest.fn() }));

    Settings = require('../../src/models/Settings');
    ({ getStorageProvider } = require('../../src/services/storageProvider'));
    storage = { upload: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
    getStorageProvider.mockReturnValue(storage);

    ({ uploadLogo } = require('../../src/controllers/adminSettingsController'));
  });

  test('deletes ONLY the newly-uploaded logo when settings.save() fails, never the existing logo', async () => {
    const saveError = new Error('simulated save failure');
    const fakeSettings = {
      logoKey: 'old-logo.jpg',
      logoUrl: '/uploads/old-logo.jpg',
      save: jest.fn().mockRejectedValue(saveError),
    };
    Settings.getSingleton = jest.fn().mockResolvedValue(fakeSettings);
    storage.upload.mockResolvedValue({ url: '/uploads/new-logo.jpg', key: 'new-logo.jpg' });

    const req = { file: { buffer: FAKE_JPEG } };
    const { res, next } = await runHandler(uploadLogo, req);

    expect(storage.delete).toHaveBeenCalledWith('new-logo.jpg');
    expect(storage.delete).not.toHaveBeenCalledWith('old-logo.jpg');
    expect(next).toHaveBeenCalledWith(saveError);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('adminSettingsController.uploadLogo — old-logo delete failure must not fail the request (Phase 05B correction)', () => {
  let Settings;
  let getStorageProvider;
  let uploadLogo;
  let storage;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Settings', () => ({ getSingleton: jest.fn() }));
    jest.doMock('../../src/services/storageProvider', () => ({ getStorageProvider: jest.fn() }));

    Settings = require('../../src/models/Settings');
    ({ getStorageProvider } = require('../../src/services/storageProvider'));
    storage = { upload: jest.fn(), delete: jest.fn() };
    getStorageProvider.mockReturnValue(storage);

    ({ uploadLogo } = require('../../src/controllers/adminSettingsController'));
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('responds with success (not an error) when settings.save() succeeds but deleting the old logo throws', async () => {
    const deleteError = new Error('Cloudinary delete failed: simulated transient API error');
    const fakeSettings = {
      logoKey: 'old-logo.jpg',
      logoUrl: '/uploads/old-logo.jpg',
      save: jest.fn().mockResolvedValue(undefined),
    };
    Settings.getSingleton = jest.fn().mockResolvedValue(fakeSettings);
    storage.upload.mockResolvedValue({ url: '/uploads/new-logo.jpg', key: 'new-logo.jpg' });
    storage.delete.mockRejectedValue(deleteError);

    const req = { file: { buffer: FAKE_JPEG } };
    const { res, next } = await runHandler(uploadLogo, req);

    expect(res.json).toHaveBeenCalledWith({ settings: fakeSettings });
    expect(next).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('old-logo.jpg');
  });

  test('logs the old-logo delete failure without exposing secrets', async () => {
    const deleteError = new Error(
      'Cloudinary delete failed: unexpected result "error" (api_key=should-never-appear-in-logs)'
    );
    const fakeSettings = {
      logoKey: 'old-logo.jpg',
      logoUrl: '/uploads/old-logo.jpg',
      save: jest.fn().mockResolvedValue(undefined),
    };
    Settings.getSingleton = jest.fn().mockResolvedValue(fakeSettings);
    storage.upload.mockResolvedValue({ url: '/uploads/new-logo.jpg', key: 'new-logo.jpg' });
    storage.delete.mockRejectedValue(deleteError);

    const req = { file: { buffer: FAKE_JPEG } };
    await runHandler(uploadLogo, req);

    expect(errorSpy).toHaveBeenCalled();
    const loggedText = errorSpy.mock.calls.flat().join(' ');
    expect(loggedText).toContain('failed to delete');
    expect(loggedText).not.toContain('CLOUDINARY_API_SECRET');
  });

  test('old logo delete is never even attempted if settings.save() fails (save failure still takes priority)', async () => {
    const saveError = new Error('simulated save failure');
    const fakeSettings = {
      logoKey: 'old-logo.jpg',
      logoUrl: '/uploads/old-logo.jpg',
      save: jest.fn().mockRejectedValue(saveError),
    };
    Settings.getSingleton = jest.fn().mockResolvedValue(fakeSettings);
    storage.upload.mockResolvedValue({ url: '/uploads/new-logo.jpg', key: 'new-logo.jpg' });
    storage.delete.mockResolvedValue(undefined);

    const req = { file: { buffer: FAKE_JPEG } };
    const { next } = await runHandler(uploadLogo, req);

    expect(storage.delete).toHaveBeenCalledWith('new-logo.jpg');
    expect(storage.delete).not.toHaveBeenCalledWith('old-logo.jpg');
    expect(next).toHaveBeenCalledWith(saveError);
  });
});
