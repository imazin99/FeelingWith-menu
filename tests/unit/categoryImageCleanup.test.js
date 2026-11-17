// Independent category images (owner-approved enhancement) —
// adminCategoryController.uploadImage/removeImage follow the exact same
// conventions as adminProductController.uploadImage (see
// imageUploadCleanup.test.js): upload-then-save-then-cleanup ordering, the
// new image/DB-save failure path preserving the old image, and the
// Phase 05B correction that a failure deleting the now-obsolete OLD image
// (after a successful save) must never turn the response into a failure.
// Pure control-flow logic around a mocked Category model and storage
// provider — no real database or disk access needed.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

function runHandler(handler, req) {
  return new Promise((resolve) => {
    const res = {};
    const next = jest.fn(() => resolve({ res, next }));
    res.json = jest.fn(() => resolve({ res, next }));
    handler(req, res, next);
  });
}

describe('adminCategoryController.uploadImage', () => {
  let Category;
  let getStorageProvider;
  let uploadImage;
  let storage;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Category', () => ({ findById: jest.fn() }));
    jest.doMock('../../src/services/storageProvider', () => ({ getStorageProvider: jest.fn() }));

    Category = require('../../src/models/Category');
    ({ getStorageProvider } = require('../../src/services/storageProvider'));
    storage = { upload: jest.fn(), delete: jest.fn() };
    getStorageProvider.mockReturnValue(storage);

    ({ uploadImage } = require('../../src/controllers/adminCategoryController'));
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function fakeCategory(initial) {
    const category = { name: 'Hot Coffee', ...initial, save: jest.fn().mockResolvedValue(undefined) };
    Category.findById.mockResolvedValue(category);
    return category;
  }

  test('rejects when no file is attached', async () => {
    const req = { params: { id: 'c1' }, file: undefined };
    const { next } = await runHandler(uploadImage, req);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].message).toMatch(/no image file/i);
  });

  test('rejects a non-image file (magic-byte sniff)', async () => {
    const req = { params: { id: 'c1' }, file: { buffer: Buffer.from('not an image') } };
    const { next } = await runHandler(uploadImage, req);
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0].message).toMatch(/not a supported image/i);
  });

  test('404s when the category does not exist', async () => {
    Category.findById.mockResolvedValue(null);
    const req = { params: { id: 'missing' }, file: { buffer: FAKE_JPEG } };
    const { next } = await runHandler(uploadImage, req);
    expect(next.mock.calls[0][0].message).toMatch(/not found/i);
  });

  test('on first upload, uploads and saves — no old key to delete', async () => {
    const category = fakeCategory({ imageKey: undefined, imageUrl: undefined });
    storage.upload.mockResolvedValue({ url: '/uploads/new.jpg', key: 'new.jpg' });

    const req = { params: { id: 'c1' }, file: { buffer: FAKE_JPEG } };
    const { res } = await runHandler(uploadImage, req);

    expect(category.save).toHaveBeenCalledTimes(1);
    expect(category.imageUrl).toBe('/uploads/new.jpg');
    expect(category.imageKey).toBe('new.jpg');
    expect(storage.delete).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ category });
  });

  test('replacing an image deletes the OLD key only after save succeeds', async () => {
    const category = fakeCategory({ imageKey: 'old.jpg', imageUrl: '/uploads/old.jpg' });
    storage.upload.mockResolvedValue({ url: '/uploads/new.jpg', key: 'new.jpg' });
    storage.delete.mockResolvedValue(undefined);

    const req = { params: { id: 'c1' }, file: { buffer: FAKE_JPEG } };
    await runHandler(uploadImage, req);

    expect(category.save).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('old.jpg');
    expect(category.imageKey).toBe('new.jpg');
  });

  test('if category.save() fails, the NEW upload is cleaned up and the OLD image is left untouched', async () => {
    const saveError = new Error('simulated DB failure');
    const category = fakeCategory({ imageKey: 'old.jpg', imageUrl: '/uploads/old.jpg' });
    category.save.mockRejectedValue(saveError);
    storage.upload.mockResolvedValue({ url: '/uploads/new.jpg', key: 'new.jpg' });

    const req = { params: { id: 'c1' }, file: { buffer: FAKE_JPEG } };
    const { next } = await runHandler(uploadImage, req);

    expect(storage.delete).toHaveBeenCalledWith('new.jpg'); // orphaned NEW file cleaned up
    expect(storage.delete).not.toHaveBeenCalledWith('old.jpg'); // OLD image preserved
    expect(next).toHaveBeenCalledWith(saveError);
  });

  test('Phase 05B correction: a failure deleting the OLD image after a successful save does not fail the request', async () => {
    const category = fakeCategory({ imageKey: 'old.jpg', imageUrl: '/uploads/old.jpg' });
    storage.upload.mockResolvedValue({ url: '/uploads/new.jpg', key: 'new.jpg' });
    storage.delete.mockRejectedValue(new Error('Cloudinary delete failed: simulated transient error'));

    const req = { params: { id: 'c1' }, file: { buffer: FAKE_JPEG } };
    const { res, next } = await runHandler(uploadImage, req);

    expect(res.json).toHaveBeenCalledWith({ category });
    expect(next).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('failed to delete');
  });
});

describe('adminCategoryController.removeImage', () => {
  let Category;
  let getStorageProvider;
  let removeImage;
  let storage;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Category', () => ({ findById: jest.fn() }));
    jest.doMock('../../src/services/storageProvider', () => ({ getStorageProvider: jest.fn() }));

    Category = require('../../src/models/Category');
    ({ getStorageProvider } = require('../../src/services/storageProvider'));
    storage = { upload: jest.fn(), delete: jest.fn() };
    getStorageProvider.mockReturnValue(storage);

    ({ removeImage } = require('../../src/controllers/adminCategoryController'));
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function fakeCategory(initial) {
    const category = { name: 'Hot Coffee', ...initial, save: jest.fn().mockResolvedValue(undefined) };
    Category.findById.mockResolvedValue(category);
    return category;
  }

  test('404s when the category does not exist', async () => {
    Category.findById.mockResolvedValue(null);
    const req = { params: { id: 'missing' } };
    const { next } = await runHandler(removeImage, req);
    expect(next.mock.calls[0][0].message).toMatch(/not found/i);
  });

  test('is a safe no-op when the category has no image', async () => {
    const category = fakeCategory({ imageKey: undefined, imageUrl: undefined });
    const req = { params: { id: 'c1' } };
    const { res } = await runHandler(removeImage, req);
    expect(category.save).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ category });
  });

  test('clears imageUrl/imageKey, saves, then deletes the stored file', async () => {
    const category = fakeCategory({ imageKey: 'old.jpg', imageUrl: '/uploads/old.jpg' });
    storage.delete.mockResolvedValue(undefined);

    const req = { params: { id: 'c1' } };
    await runHandler(removeImage, req);

    expect(category.imageUrl).toBeUndefined();
    expect(category.imageKey).toBeUndefined();
    expect(category.save).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('old.jpg');
  });

  test('a failure deleting the file after a successful save does not fail the request', async () => {
    const category = fakeCategory({ imageKey: 'old.jpg', imageUrl: '/uploads/old.jpg' });
    storage.delete.mockRejectedValue(new Error('Cloudinary delete failed: simulated transient error'));

    const req = { params: { id: 'c1' } };
    const { res, next } = await runHandler(removeImage, req);

    expect(res.json).toHaveBeenCalledWith({ category });
    expect(next).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
