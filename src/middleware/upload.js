const multer = require('multer');
const ApiError = require('../utils/ApiError');

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB ceiling (architecture doc, section 5)

const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Buffer in memory, never written to disk under the original filename —
// the storage provider renames to a generated id (section 5).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter(req, file, cb) {
    // Fast rejection by header/extension first; the magic-byte check in the
    // controller is the real, untrusted-client-proof gate.
    //
    // Final review (multer error handling): this is an ApiError, not a
    // plain Error, specifically so src/middleware/errorHandler.js's
    // existing `instanceof ApiError` branch normalizes it to a clean 400
    // — previously a plain Error fell through to the generic 500 branch.
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      return cb(ApiError.badRequest('Unsupported image format. Allowed formats: JPEG, PNG, WebP.'));
    }
    cb(null, true);
  },
});

module.exports = { upload, MAX_BYTES };
