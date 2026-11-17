const Product = require('../models/Product');
const AddOn = require('../models/AddOn');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getStorageProvider } = require('../services/storageProvider');
const { sniffImage } = require('../utils/imageSniff');

// GET /api/admin/products?category=&isVisible=&isAvailable=&isArchived=
const listProducts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.categoryId = req.query.category;
  if (req.query.isVisible !== undefined) filter.isVisible = req.query.isVisible === 'true';
  if (req.query.isAvailable !== undefined) filter.isAvailable = req.query.isAvailable === 'true';
  if (req.query.isArchived !== undefined) filter.isArchived = req.query.isArchived === 'true';
  // Default dashboard list view excludes archived unless explicitly asked for.
  if (req.query.isArchived === undefined) filter.isArchived = false;

  const products = await Product.find(filter).sort({ displayOrder: 1 }).populate('addOnIds');
  res.json({ products });
});

async function assertCategoryExists(categoryId) {
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) throw ApiError.badRequest('categoryId does not reference an existing category.');
}

async function assertAddOnsExist(addOnIds) {
  if (!addOnIds || addOnIds.length === 0) return;
  const count = await AddOn.countDocuments({ _id: { $in: addOnIds } });
  if (count !== new Set(addOnIds).size) {
    throw ApiError.badRequest('One or more addOnIds do not reference an existing add-on.');
  }
}

// POST /api/admin/products
const createProduct = asyncHandler(async (req, res) => {
  const { name, description, price, categoryId, addOnIds, variants, displayOrder } = req.body;

  await assertCategoryExists(categoryId);
  await assertAddOnsExist(addOnIds);

  const product = await Product.create({
    name,
    description,
    price,
    categoryId,
    addOnIds: addOnIds || [],
    variants: variants || [],
    displayOrder,
  });
  res.status(201).json({ product });
});

// GET /api/admin/products/:id
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('addOnIds');
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// PUT /api/admin/products/:id — name/description/price/category/variants
//
// Code review fix #6 (approved pricing decision): this uses fetch-then-
// `.save()` rather than `findByIdAndUpdate`, specifically so the Product
// model's pre('validate') fixed-vs-variant mutual-exclusivity check (and
// each variant's own required/integer price validation) runs against the
// FULL, resulting document — not just whichever fields happen to be in
// this particular PATCH body. `findByIdAndUpdate(..., { runValidators: true })`
// only validates the fields present in the update payload and does not run
// document middleware at all, so e.g. sending only `{ variants: [...] }`
// on a product that currently has a fixed price would never have been
// checked against that fixed price under the old approach.
const updateProduct = asyncHandler(async (req, res) => {
  const { name, description, price, categoryId, variants, displayOrder } = req.body;
  if (categoryId !== undefined) await assertCategoryExists(categoryId);

  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found.');

  if (name !== undefined) product.name = name;
  if (description !== undefined) product.description = description;
  if (price !== undefined) product.price = price;
  if (categoryId !== undefined) product.categoryId = categoryId;
  if (variants !== undefined) product.variants = variants;
  if (displayOrder !== undefined) product.displayOrder = displayOrder;

  // No implicit pricing-mode switching here: if this update would leave
  // the product with both a fixed price AND variants (or neither), it is
  // rejected by the model's validation below — the caller must say
  // explicitly which field to clear (`price: null` or `variants: []`) to
  // switch modes, rather than Claude guessing their intent.
  await product.save();
  await product.populate('addOnIds');
  res.json({ product });
});

// PATCH /api/admin/products/:id/visibility — { isVisible }
const setVisibility = asyncHandler(async (req, res) => {
  const { isVisible } = req.body;
  if (typeof isVisible !== 'boolean') throw ApiError.badRequest('isVisible must be a boolean.');
  const product = await Product.findByIdAndUpdate(req.params.id, { isVisible }, { new: true, runValidators: true });
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// PATCH /api/admin/products/:id/availability — { isAvailable }
const setAvailability = asyncHandler(async (req, res) => {
  const { isAvailable } = req.body;
  if (typeof isAvailable !== 'boolean') throw ApiError.badRequest('isAvailable must be a boolean.');
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { isAvailable },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// PATCH /api/admin/products/:id/archive — { isArchived }
const setArchived = asyncHandler(async (req, res) => {
  const { isArchived } = req.body;
  if (typeof isArchived !== 'boolean') throw ApiError.badRequest('isArchived must be a boolean.');
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { isArchived },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// PATCH /api/admin/products/:id/reorder — { displayOrder }
const reorder = asyncHandler(async (req, res) => {
  const { displayOrder } = req.body;
  if (typeof displayOrder !== 'number' || displayOrder < 0) {
    throw ApiError.badRequest('displayOrder must be a non-negative number.');
  }
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { displayOrder },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// PATCH /api/admin/products/:id/top-seller — { isTopSeller }
//
// Manually-curated "Top Sellers" (owner-approved enhancement): a plain
// admin on/off flag, never computed from sales/order data (this app has
// no ordering system at all). Archived products can still be flagged here
// without affecting the public menu — they are already excluded from
// every public endpoint by their own isArchived/isVisible state, same as
// everywhere else in this API — so no extra guard is needed for that.
const setTopSeller = asyncHandler(async (req, res) => {
  const { isTopSeller } = req.body;
  if (typeof isTopSeller !== 'boolean') throw ApiError.badRequest('isTopSeller must be a boolean.');
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { isTopSeller },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// PATCH /api/admin/products/:id/top-seller-order — { topSellerOrder }
// Same shape/validation as the existing displayOrder `reorder` endpoint
// above, but for a product's position among OTHER top sellers
// specifically — independent of its position within its own category.
const reorderTopSeller = asyncHandler(async (req, res) => {
  const { topSellerOrder } = req.body;
  if (typeof topSellerOrder !== 'number' || topSellerOrder < 0) {
    throw ApiError.badRequest('topSellerOrder must be a non-negative number.');
  }
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { topSellerOrder },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// POST /api/admin/products/:id/addons — { addOnIds: [...] } — replaces the
// attached set (attach/detach in one call, per the architecture doc).
const setAddOns = asyncHandler(async (req, res) => {
  const { addOnIds } = req.body;
  if (!Array.isArray(addOnIds)) throw ApiError.badRequest('addOnIds must be an array.');
  await assertAddOnsExist(addOnIds);

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { addOnIds },
    { new: true, runValidators: true }
  ).populate('addOnIds');
  if (!product) throw ApiError.notFound('Product not found.');
  res.json({ product });
});

// POST /api/admin/products/:id/image — multipart/form-data, field "image"
const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No image file provided.');

  const sniffed = sniffImage(req.file.buffer);
  if (!sniffed) {
    throw ApiError.badRequest('File content is not a supported image (JPEG, PNG, WebP).');
  }

  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found.');

  const storage = getStorageProvider();
  const { url, key } = await storage.upload(req.file, sniffed.ext);

  const oldKey = product.imageKey;
  product.imageUrl = url;
  product.imageKey = key;

  // Code review fix #7: the new file is already written by storage.upload()
  // above at this point. If product.save() then fails (validation error,
  // transient DB error, …), the old code left that newly-uploaded file
  // orphaned on disk forever, with the product's document still pointing at
  // whatever it pointed at before (i.e. nothing changed on the product, so
  // no image is lost — but the new file leaks). Clean up exactly the NEW
  // key on that failure path, then re-throw so the error response is
  // unchanged; `oldKey` is never touched here — the existing image a
  // product already had must survive a failed replacement attempt intact.
  try {
    await product.save();
  } catch (err) {
    await storage.delete(key);
    throw err;
  }

  // Delete the old image only after the new one is confirmed persisted
  // (section 5) — never before, so a failed upload never leaves a product
  // imageless.
  //
  // Correction (Phase 05B review): this cleanup is best-effort. The
  // database update above already succeeded and the product already
  // points at the new image — a transient failure deleting the now-
  // obsolete OLD image (e.g. a Cloudinary API error) is not the caller's
  // problem and must never turn this already-successful request into an
  // error response. Log it (message only — never the storage key or any
  // credential) and move on; the old file is simply left behind as an
  // orphan to be cleaned up later rather than blocking the response.
  if (oldKey) {
    try {
      await storage.delete(oldKey);
    } catch (err) {
      console.error(
        'uploadImage: failed to delete replaced old image (non-fatal, response still succeeds):',
        err && err.message ? err.message : err
      );
    }
  }

  res.json({ product });
});

module.exports = {
  listProducts,
  createProduct,
  getProduct,
  updateProduct,
  setVisibility,
  setAvailability,
  setArchived,
  reorder,
  setTopSeller,
  reorderTopSeller,
  setAddOns,
  uploadImage,
};
