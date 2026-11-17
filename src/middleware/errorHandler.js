const mongoose = require('mongoose');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Final review (multer error handling): a Multer file-size-limit
// violation (`upload.single('image')` throwing when the body exceeds
// MAX_BYTES, src/middleware/upload.js) is a multer.MulterError, not a
// Mongoose or ApiError — it was previously falling through to the
// generic 500 branch below instead of a proper 413. Mapped by `err.code`
// to our own safe, fixed messages (never `err.message` verbatim) so
// nothing Multer-internal ever reaches the client.
const MULTER_ERROR_RESPONSES = {
  LIMIT_FILE_SIZE: { status: 413, message: 'File is too large. Maximum size is 5 MB.' },
};
const DEFAULT_MULTER_ERROR_RESPONSE = { status: 400, message: 'Invalid upload request.' };

// Single normalization point for every error in the app (architecture doc,
// section 3). Never leaks stack traces or internals to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Mongoose validation errors -> 400 with field-level details.
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message])
    );
    return res.status(400).json({ error: { message: 'Validation failed.', details } });
  }

  if (err instanceof multer.MulterError) {
    const { status, message } = MULTER_ERROR_RESPONSES[err.code] || DEFAULT_MULTER_ERROR_RESPONSE;
    return res.status(status).json({ error: { message } });
  }

  // Duplicate-key error (unique index violation).
  if (err && err.code === 11000) {
    return res.status(409).json({
      error: { message: 'A record with that value already exists.', details: err.keyValue },
    });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { message: `Invalid ${err.path}.` } });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // Unknown error — log server-side, never expose internals.
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error.' } });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Route not found.' } });
}

module.exports = { errorHandler, notFoundHandler };
