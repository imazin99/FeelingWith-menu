// Final review (multer error handling): the fileFilter in
// src/middleware/upload.js must reject an unsupported MIME type with an
// ApiError (so errorHandler normalizes it to 400), not a plain Error
// (which previously fell through to the generic 500 branch). This calls
// multer's fileFilter function directly — no HTTP server or multipart
// parsing needed, so it's a genuine, DB-free unit test.
//
// multer({...}) doesn't expose the configured fileFilter on the returned
// object directly, so this captures the options object multer.js is
// actually constructed with by mocking the `multer` package itself. Every
// require below happens AFTER jest.resetModules()+jest.doMock(), inside
// beforeAll, so upload.js, ApiError, and this test file all resolve
// `require('../utils/ApiError')` to the exact same module instance —
// otherwise `instanceof ApiError` fails despite being logically the same
// class (a classic Jest module-registry pitfall).
describe('upload.js — fileFilter rejects unsupported MIME types safely', () => {
  let capturedOptions;
  let upload;
  let MAX_BYTES;
  let ApiError;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('multer', () => {
      const actualMulter = jest.requireActual('multer');
      const mockMulter = jest.fn((options) => {
        capturedOptions = options;
        return actualMulter(options);
      });
      mockMulter.memoryStorage = actualMulter.memoryStorage;
      mockMulter.MulterError = actualMulter.MulterError;
      return mockMulter;
    });

    ApiError = require('../../src/utils/ApiError');
    ({ upload, MAX_BYTES } = require('../../src/middleware/upload'));
  });

  afterAll(() => {
    jest.dontMock('multer');
    jest.resetModules();
  });

  test('MAX_BYTES is the documented 5 MB ceiling', () => {
    expect(MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  test('fileFilter rejects an unsupported MIME type with an ApiError(400), not a plain Error', () => {
    expect(capturedOptions.fileFilter).toBeDefined();
    const cb = jest.fn();
    capturedOptions.fileFilter({}, { mimetype: 'application/pdf' }, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const err = cb.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/unsupported image format/i);
  });

  test.each(['image/jpeg', 'image/png', 'image/webp'])('fileFilter accepts %s', (mimetype) => {
    const cb = jest.fn();
    capturedOptions.fileFilter({}, { mimetype }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('the multer instance is configured with the documented 5 MB file-size limit', () => {
    expect(capturedOptions.limits.fileSize).toBe(MAX_BYTES);
  });

  test('the exported upload object is a real multer instance (has .single/.array)', () => {
    expect(typeof upload.single).toBe('function');
  });
});
