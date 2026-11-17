const mongoose = require('mongoose');
const multer = require('multer');
const { errorHandler, notFoundHandler } = require('../../src/middleware/errorHandler');
const ApiError = require('../../src/utils/ApiError');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('normalizes an ApiError to its own status code and message', () => {
    const res = mockRes();
    errorHandler(ApiError.notFound('Category not found.'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Category not found.' } });
  });

  test('normalizes a Mongoose ValidationError to 400 with field details', async () => {
    const Model = mongoose.model(
      'TestValidation' + Date.now(),
      new mongoose.Schema({ name: { type: String, required: true } })
    );
    const doc = new Model({});
    let validationError;
    try {
      await doc.validate();
    } catch (err) {
      validationError = err;
    }

    const res = mockRes();
    errorHandler(validationError, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('Validation failed.');
    expect(body.error.details).toHaveProperty('name');
  });

  test('normalizes a duplicate-key error (code 11000) to 409', () => {
    const res = mockRes();
    const dupError = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyValue: { name: 'Hot Coffee' },
    });
    errorHandler(dupError, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.details).toEqual({ name: 'Hot Coffee' });
  });

  test('normalizes an unknown error to 500 and never leaks internals', () => {
    const res = mockRes();
    errorHandler(new Error('something exploded with a stack trace'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Internal server error.' } });
  });

  // Final review — multer error handling: a file-size-limit violation
  // (LIMIT_FILE_SIZE, thrown by Multer itself, not by our fileFilter) and
  // an unsupported-format rejection (an ApiError we throw from
  // src/middleware/upload.js's fileFilter — covered by the ApiError test
  // above) previously both fell through to the generic 500 branch.
  test('normalizes a Multer LIMIT_FILE_SIZE error to 413, with a fixed safe message', () => {
    const res = mockRes();
    const sizeError = new multer.MulterError('LIMIT_FILE_SIZE');
    errorHandler(sizeError, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'File is too large. Maximum size is 5 MB.' } });
  });

  test('normalizes any other Multer error to 400, without leaking Multer\'s own message', () => {
    const res = mockRes();
    // e.g. LIMIT_UNEXPECTED_FILE — a wrong form-field name, multiple files
    // sent where one is expected, etc.
    const otherError = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image');
    errorHandler(otherError, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('Invalid upload request.');
    expect(body.error.message).not.toMatch(/unexpected field/i); // Multer's own wording never leaks
  });

  test('a plain Error thrown from fileFilter (pre-fix behavior) would still never leak its message at 500', () => {
    // Regression guard: even if some future code path throws a bare Error
    // instead of an ApiError/MulterError, the 500 fallback already never
    // echoes err.message back to the client (see the "unknown error" test
    // above) — this just documents that upload.js's fileFilter no longer
    // does this (it throws ApiError.badRequest instead; see upload.test.js).
    const res = mockRes();
    errorHandler(new Error('Unsupported image format.'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Internal server error.' } });
  });
});

describe('notFoundHandler', () => {
  test('returns a 404 JSON body for an unmatched route', () => {
    const res = mockRes();
    notFoundHandler({}, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { message: 'Route not found.' } });
  });
});
