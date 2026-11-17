const { body, param } = require('express-validator');
const mongoose = require('mongoose');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Pricing decision (approved, code review round 2 — fix #6): a product is
// either fixed-price (`price`, no variants) or variant-priced (one or
// more `variants`, each with its own required, integer, non-negative
// `price` — no `priceModifier`), never both. This cross-field check gives
// a clean 400 at the HTTP layer before touching the database; the Product
// model (src/models/Product.js) enforces the same rule independently as a
// defense-in-depth safety net for any other code path that writes a
// Product document.
function hasVariantsIn(body) {
  return Array.isArray(body.variants) && body.variants.length > 0;
}
function hasFixedPriceIn(body) {
  return body.price !== undefined && body.price !== null;
}

const pricingModeRuleForCreate = body().custom((_, { req }) => {
  const hasVariants = hasVariantsIn(req.body);
  const hasFixedPrice = hasFixedPriceIn(req.body);
  if (hasVariants && hasFixedPrice) {
    throw new Error('A product cannot have both a fixed price and variants — use one pricing mode, not both.');
  }
  if (!hasVariants && !hasFixedPrice) {
    throw new Error('A product needs either a fixed price or at least one priced variant.');
  }
  return true;
});

// For a partial update, "neither" can't be judged from the request body
// alone (the other field may already exist on the stored document), so
// only the unambiguous "both present in THIS request" case is checked
// here. The full, document-aware mutual-exclusivity check still runs in
// the model when the controller saves the merged result.
const pricingModeRuleForUpdate = body().custom((_, { req }) => {
  if (hasVariantsIn(req.body) && hasFixedPriceIn(req.body)) {
    throw new Error('A product cannot have both a fixed price and variants — use one pricing mode, not both.');
  }
  return true;
});

const createProductRules = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('name must be 2-100 characters.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('description must be <= 500 characters.'),
  // Required only when the product has no variants — enforced by the
  // pricingModeRuleForCreate cross-field check below, not by .isInt()
  // alone, since a variant-priced product correctly omits `price`. Final
  // review fix #2: a fixed price is an integer number of piastres, same
  // as a variant price.
  body('price').optional({ nullable: true }).isInt({ min: 0 }).withMessage('price must be a non-negative whole number (piastres).'),
  body('categoryId').custom(isObjectId).withMessage('categoryId must be a valid id.'),
  body('displayOrder').optional().isInt({ min: 0 }).withMessage('displayOrder must be >= 0.'),
  body('addOnIds').optional().isArray().withMessage('addOnIds must be an array.'),
  body('addOnIds.*').optional().custom(isObjectId).withMessage('Each addOnId must be a valid id.'),
  body('variants').optional().isArray().withMessage('variants must be an array.'),
  body('variants.*.name').optional().trim().isLength({ min: 1, max: 30 }).withMessage('variant name must be 1-30 characters.'),
  // Independent, required price per variant (piastres — a whole number,
  // zero allowed, negative rejected). No priceModifier. (The wildcard
  // path simply has no elements to check when `variants` is absent, so no
  // `.optional()`/`.if()` guard is needed here.)
  body('variants.*.price').isInt({ min: 0 }).withMessage('variant price must be a non-negative whole number (piastres).'),
  pricingModeRuleForCreate,
];

const updateProductRules = [
  param('id').custom(isObjectId).withMessage('Invalid product id.'),
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('name must be 2-100 characters.'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 500 }).withMessage('description must be <= 500 characters.'),
  body('price').optional({ nullable: true }).isInt({ min: 0 }).withMessage('price must be a non-negative whole number (piastres).'),
  body('categoryId').optional().custom(isObjectId).withMessage('categoryId must be a valid id.'),
  body('displayOrder').optional().isInt({ min: 0 }).withMessage('displayOrder must be >= 0.'),
  body('variants').optional().isArray().withMessage('variants must be an array.'),
  body('variants.*.name').optional().trim().isLength({ min: 1, max: 30 }).withMessage('variant name must be 1-30 characters.'),
  body('variants.*.price').isInt({ min: 0 }).withMessage('variant price must be a non-negative whole number (piastres).'),
  pricingModeRuleForUpdate,
];

const setAddOnsRules = [
  param('id').custom(isObjectId).withMessage('Invalid product id.'),
  body('addOnIds').isArray().withMessage('addOnIds must be an array.'),
  body('addOnIds.*').custom(isObjectId).withMessage('Each addOnId must be a valid id.'),
];

const idParamRule = [param('id').custom(isObjectId).withMessage('Invalid product id.')];

module.exports = { createProductRules, updateProductRules, setAddOnsRules, idParamRule };
