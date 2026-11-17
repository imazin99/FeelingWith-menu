const Settings = require('../models/Settings');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getStorageProvider } = require('../services/storageProvider');
const { sniffImage } = require('../utils/imageSniff');

// Only the fields confirmed editable-now (architecture doc, section 7):
// cafeName, tagline, logoUrl (via upload), contact, socialLinks, language,
// isRtl. Deferred fields (layout/card-style/density/display config) have no
// backing fields at all in this phase, so there is nothing to accidentally
// expose here.
const EDITABLE_FIELDS = ['cafeName', 'tagline', 'contact', 'socialLinks', 'language', 'isRtl'];

// GET /api/admin/settings
const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getSingleton();
  res.json({ settings });
});

// PATCH /api/admin/settings
const updateSettings = asyncHandler(async (req, res) => {
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) update[field] = req.body[field];
  }
  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest('No editable fields provided.');
  }

  const settings = await Settings.findByIdAndUpdate(Settings.SINGLETON_ID, update, {
    new: true,
    upsert: true,
    runValidators: true,
  });
  res.json({ settings });
});

// POST /api/admin/settings/logo — multipart/form-data, field "image"
const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No image file provided.');

  const sniffed = sniffImage(req.file.buffer);
  if (!sniffed) {
    throw ApiError.badRequest('File content is not a supported image (JPEG, PNG, WebP).');
  }

  const settings = await Settings.getSingleton();
  const storage = getStorageProvider();
  const { url, key } = await storage.upload(req.file, sniffed.ext);

  const oldKey = settings.logoKey;
  settings.logoUrl = url;
  settings.logoKey = key;

  // Code review fix #7 (same pattern as adminProductController.uploadImage):
  // clean up the newly-uploaded file if persisting the Settings document
  // fails, without touching the pre-existing logo (`oldKey`).
  try {
    await settings.save();
  } catch (err) {
    await storage.delete(key);
    throw err;
  }

  // Correction (Phase 05B review): same reasoning as
  // adminProductController.uploadImage — the Settings document has already
  // been saved with the new logo at this point, so a failure to delete the
  // now-obsolete old logo must never turn this already-successful request
  // into an error response. Log it (message only — never the storage key
  // or any credential) and leave the old file as an orphan rather than
  // blocking the response.
  if (oldKey) {
    try {
      await storage.delete(oldKey);
    } catch (err) {
      console.error(
        'uploadLogo: failed to delete replaced old logo (non-fatal, response still succeeds):',
        err && err.message ? err.message : err
      );
    }
  }

  res.json({ settings });
});

module.exports = { getSettings, updateSettings, uploadLogo };
