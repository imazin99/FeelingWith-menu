const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getStorageProvider } = require('../services/storageProvider');
const { sniffImage } = require('../utils/imageSniff');

// GET /api/admin/categories — full list (unlike the public endpoint, this
// includes hidden and archived categories so the dashboard can manage them).
const listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ displayOrder: 1 });
  res.json({ categories });
});

// POST /api/admin/categories
const createCategory = asyncHandler(async (req, res) => {
  const { name, displayOrder } = req.body;
  const category = await Category.create({ name, displayOrder });
  res.status(201).json({ category });
});

// GET /api/admin/categories/:id
const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found.');
  res.json({ category });
});

// PUT /api/admin/categories/:id — full edit (name, displayOrder)
const updateCategory = asyncHandler(async (req, res) => {
  const { name, displayOrder } = req.body;
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { ...(name !== undefined ? { name } : {}), ...(displayOrder !== undefined ? { displayOrder } : {}) },
    { new: true, runValidators: true }
  );
  if (!category) throw ApiError.notFound('Category not found.');
  res.json({ category });
});

// PATCH /api/admin/categories/:id/visibility — { isVisible }
const setVisibility = asyncHandler(async (req, res) => {
  const { isVisible } = req.body;
  if (typeof isVisible !== 'boolean') throw ApiError.badRequest('isVisible must be a boolean.');
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { isVisible },
    { new: true, runValidators: true }
  );
  if (!category) throw ApiError.notFound('Category not found.');
  res.json({ category });
});

// PATCH /api/admin/categories/:id/archive — { isArchived }
const setArchived = asyncHandler(async (req, res) => {
  const { isArchived } = req.body;
  if (typeof isArchived !== 'boolean') throw ApiError.badRequest('isArchived must be a boolean.');
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { isArchived },
    { new: true, runValidators: true }
  );
  if (!category) throw ApiError.notFound('Category not found.');
  res.json({ category });
});

// PATCH /api/admin/categories/:id/reorder — { displayOrder }
const reorder = asyncHandler(async (req, res) => {
  const { displayOrder } = req.body;
  if (typeof displayOrder !== 'number' || displayOrder < 0) {
    throw ApiError.badRequest('displayOrder must be a non-negative number.');
  }
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { displayOrder },
    { new: true, runValidators: true }
  );
  if (!category) throw ApiError.notFound('Category not found.');
  res.json({ category });
});

// POST /api/admin/categories/:id/image — multipart/form-data, field
// "image". Same storage-provider abstraction, magic-byte validation, and
// save-then-cleanup ordering as adminProductController.uploadImage
// (section 5), including its Phase 05B correction: a failure to delete
// the now-obsolete OLD image, after the new one is already saved, must
// never turn this already-successful request into an error response.
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No image file provided.');

  const sniffed = sniffImage(req.file.buffer);
  if (!sniffed) {
    throw ApiError.badRequest('File content is not a supported image (JPEG, PNG, WebP).');
  }

  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found.');

  const storage = getStorageProvider();
  const { url, key } = await storage.upload(req.file, sniffed.ext);

  const oldKey = category.imageKey;
  category.imageUrl = url;
  category.imageKey = key;

  // The new file is already written by storage.upload() above. If
  // category.save() then fails, clean up exactly the NEW key and
  // re-throw — the category's previous image (oldKey) is left completely
  // untouched, so a failed replacement never leaves a category imageless.
  try {
    await category.save();
  } catch (err) {
    await storage.delete(key);
    throw err;
  }

  // Delete the old image only after the new one is confirmed persisted —
  // and treat that cleanup as best-effort: the database update above
  // already succeeded, so a transient failure deleting the obsolete OLD
  // image must never make this request look like it failed. Log it
  // (message only — never the storage key or any credential) and move on.
  if (oldKey) {
    try {
      await storage.delete(oldKey);
    } catch (err) {
      console.error(
        'uploadCategoryImage: failed to delete replaced old image (non-fatal, response still succeeds):',
        err && err.message ? err.message : err
      );
    }
  }

  res.json({ category });
});

// DELETE /api/admin/categories/:id/image — removes the category's image
// entirely (as opposed to POST .../image, which replaces it). Same
// best-effort cleanup reasoning as the replace path above: once the
// document is saved with no image, a failure to delete the now-orphaned
// file from storage must not fail this request.
const removeImage = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found.');

  if (!category.imageKey) {
    // Nothing to remove — a safe no-op, not an error.
    res.json({ category });
    return;
  }

  const oldKey = category.imageKey;
  category.imageUrl = undefined;
  category.imageKey = undefined;
  await category.save();

  const storage = getStorageProvider();
  try {
    await storage.delete(oldKey);
  } catch (err) {
    console.error(
      'removeCategoryImage: failed to delete old image (non-fatal, response still succeeds):',
      err && err.message ? err.message : err
    );
  }

  res.json({ category });
});

module.exports = {
  listCategories,
  createCategory,
  getCategory,
  updateCategory,
  setVisibility,
  setArchived,
  reorder,
  uploadImage,
  removeImage,
};
