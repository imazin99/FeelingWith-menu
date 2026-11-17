const Category = require('../models/Category');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const asyncHandler = require('../utils/asyncHandler');

// Architecture doc, section 1 & 7: public API rules.
// - Hidden (isVisible:false) or archived (isArchived:true) categories and
//   products are excluded entirely.
// - A visible, available-or-not product IS returned; isAvailable:false just
//   gets flagged for a "Sold Out" badge, never hidden.
// - A hidden/archived category cascades to exclude all of its products,
//   regardless of each product's own flags.
// - Add-ons follow the identical rule to products (confirmed): hidden
//   add-ons are left out of the populated list entirely; unavailable-but-
//   visible ones are included and flagged.

const PUBLIC_CATEGORY_FILTER = { isVisible: true, isArchived: false };
const PUBLIC_PRODUCT_FILTER = { isVisible: true, isArchived: false };
const PUBLIC_ADDON_FILTER = { isVisible: true, isArchived: false };

function serializeCategory(category) {
  return {
    id: category._id,
    name: category.name,
    displayOrder: category.displayOrder,
    // imageUrl only — imageKey is an internal storage reference (local
    // filename or Cloudinary public_id), never exposed publicly, same
    // rule as Product.imageKey and Settings.logoKey.
    imageUrl: category.imageUrl,
  };
}

function serializeAddOn(addOn) {
  return {
    id: addOn._id,
    name: addOn.name,
    price: addOn.price,
    isAvailable: addOn.isAvailable,
  };
}

function serializeProduct(product) {
  return {
    id: product._id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    price: product.price,
    categoryId: product.categoryId,
    isAvailable: product.isAvailable, // never filtered out — only flagged
    displayOrder: product.displayOrder,
    // Pricing decision (approved, code review round 2 — fix #6): each
    // variant carries its own independent `price`, not a modifier added to
    // the product's (in this case absent) base price.
    variants: product.variants.map((v) => ({
      id: v._id,
      name: v.name,
      price: v.price,
      isAvailable: v.isAvailable,
    })),
    addOns: (product.addOnIds || [])
      // addOnIds is populated with full AddOn docs by the route handler;
      // a hidden/archived one was already excluded by the populate match,
      // so nothing further to filter here besides a defensive null-check
      // (an add-on deleted outright — never done in this API, but possible
      // via direct DB access — would populate as null).
      .filter(Boolean)
      .map(serializeAddOn),
  };
}

// GET /api/menu/categories
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find(PUBLIC_CATEGORY_FILTER).sort({ displayOrder: 1 });
  res.json({ categories: categories.map(serializeCategory) });
});

// GET /api/menu/products?category=<id>
const getProducts = asyncHandler(async (req, res) => {
  const { category } = req.query;

  // Category-visibility cascade: find the set of publicly-visible category
  // ids first, then only return products in that set — this is what keeps
  // a hidden/archived category's products out regardless of their own
  // flags (architecture doc, section 7).
  const visibleCategoryFilter = category
    ? { ...PUBLIC_CATEGORY_FILTER, _id: category }
    : PUBLIC_CATEGORY_FILTER;
  const visibleCategories = await Category.find(visibleCategoryFilter).select('_id');
  const visibleCategoryIds = visibleCategories.map((c) => c._id);

  if (visibleCategoryIds.length === 0) {
    return res.json({ products: [] });
  }

  const products = await Product.find({
    ...PUBLIC_PRODUCT_FILTER,
    categoryId: { $in: visibleCategoryIds },
  })
    .sort({ displayOrder: 1 })
    .populate({ path: 'addOnIds', match: PUBLIC_ADDON_FILTER });

  res.json({ products: products.map(serializeProduct) });
});

// GET /api/menu/top-sellers
//
// Manually-curated "Top Sellers" (owner-approved enhancement): purely a
// reflection of each product's admin-set `isTopSeller`/`topSellerOrder`
// fields — nothing here is computed from sales/order history (this app
// has no ordering system). Same visibility rules as getProducts: the
// category-visibility cascade (a hidden/archived category excludes its
// products regardless of their own flags) and the "unavailable is
// flagged, not hidden" rule both apply identically, since this reuses the
// exact same PUBLIC_PRODUCT_FILTER/PUBLIC_CATEGORY_FILTER constants.
const getTopSellers = asyncHandler(async (req, res) => {
  const visibleCategories = await Category.find(PUBLIC_CATEGORY_FILTER).select('_id');
  const visibleCategoryIds = visibleCategories.map((c) => c._id);

  if (visibleCategoryIds.length === 0) {
    return res.json({ products: [] });
  }

  const products = await Product.find({
    ...PUBLIC_PRODUCT_FILTER,
    isTopSeller: true,
    categoryId: { $in: visibleCategoryIds },
  })
    .sort({ topSellerOrder: 1 })
    .populate({ path: 'addOnIds', match: PUBLIC_ADDON_FILTER });

  res.json({ products: products.map(serializeProduct) });
});

// Code review fix #5: the approved Phase 01 document lists café name,
// tagline, logo, contact information, social links, language and RTL
// setting as public-facing (the public website needs them to render its
// header/footer/chrome), but no public route for them existed — only the
// admin-authenticated GET /api/admin/settings did. This is a read-only
// public endpoint exposing exactly that whitelist and nothing else:
// explicitly NOT `logoKey` (an internal storage reference, not a URL —
// architecture doc, section 5, "never exposed"), not `_id`/timestamps, and
// not any deferred/future field, even if one is ever added to the Settings
// schema without this list being revisited.
function serializePublicSettings(settings) {
  return {
    cafeName: settings.cafeName,
    tagline: settings.tagline,
    logoUrl: settings.logoUrl,
    contact: {
      phone: settings.contact?.phone,
      email: settings.contact?.email,
      address: settings.contact?.address,
    },
    socialLinks: {
      instagram: settings.socialLinks?.instagram,
      facebook: settings.socialLinks?.facebook,
      tiktok: settings.socialLinks?.tiktok,
      website: settings.socialLinks?.website,
    },
    language: settings.language,
    isRtl: settings.isRtl,
  };
}

// GET /api/menu/settings
//
// Final review fix #1: strictly read-only. `Settings.getPublicSingleton()`
// never creates or persists a document — if the singleton doesn't exist
// yet, it returns safe, in-memory schema defaults instead (see
// src/models/Settings.js). Admin-side initialization-on-first-access
// (Settings.getSingleton(), used by the authenticated admin routes) is a
// deliberately separate code path from this one.
const getPublicSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getPublicSingleton();
  res.json({ settings: serializePublicSettings(settings) });
});

module.exports = { getCategories, getProducts, getTopSellers, getPublicSettings };
