const mongoose = require('mongoose');

// Architecture doc — Schema Reference / Products.
// Variants stay embedded (product-specific, bounded). Add-ons are a
// reference array into the shared AddOns collection (corrected in review —
// no longer embedded).
//
// Pricing decision (approved, code review round 2 — fix #6): each variant
// carries its own, fully independent `price` — NOT a modifier added to a
// product base price. `priceModifier` is gone entirely. Example: Small =
// 5000, Medium = 6500, Large = 8000 (integer piastres). A product is either
// fixed-price (its own top-level `price`, no variants) or variant-priced
// (one or more variants, each with its own `price`) — never both; see
// productSchema.pre('validate') below for that mutual-exclusivity rule.
const variantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 30,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'variant price must be a whole number of piastres (no decimals).',
      },
    },
    isAvailable: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
    imageUrl: {
      type: String,
      default: undefined,
    },
    imageKey: {
      type: String,
      default: undefined,
    },
    // Fixed-pricing mode: required ONLY when the product has no variants.
    // Mutually exclusive with variant pricing — see the pre('validate')
    // hook below (fix #6). Final review fix #2: a fixed price is an
    // integer number of piastres too, same as a variant price — zero
    // allowed, negative or fractional rejected.
    price: {
      type: Number,
      min: 0,
      required: function () {
        return !Array.isArray(this.variants) || this.variants.length === 0;
      },
      validate: {
        validator: function (value) {
          // Only applies when a fixed price is actually set — `undefined`/
          // `null` (variant-priced products) are handled by `required`
          // and the mutual-exclusivity hook, not this check.
          return value === undefined || value === null || Number.isInteger(value);
        },
        message: 'price must be a whole number of piastres (no decimals).',
      },
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    addOnIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddOn',
      },
    ],
    isVisible: {
      type: Boolean,
      required: true,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      required: true,
      default: true,
    },
    isArchived: {
      type: Boolean,
      required: true,
      default: false,
    },
    displayOrder: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // Manually-curated "Top Sellers" feature (owner-approved enhancement):
    // deliberately NOT a sales-analytics field — nothing here is computed
    // from order history (this app has no ordering system at all). The
    // admin explicitly flags a product as featured and sets its own
    // display order among OTHER top sellers (independent of the
    // category-grid `displayOrder` above). Kept directly on Product
    // (simplest suitable model, per the brief) rather than a new
    // collection — there is nothing here that needs to exist
    // independently of a product.
    isTopSeller: {
      type: Boolean,
      required: true,
      default: false,
    },
    topSellerOrder: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    variants: [variantSchema],
  },
  { timestamps: true }
);

productSchema.index({ categoryId: 1, displayOrder: 1 });
productSchema.index({ isVisible: 1, isAvailable: 1, isArchived: 1 });
productSchema.index({ isTopSeller: 1, topSellerOrder: 1 });
productSchema.index({ addOnIds: 1 });
productSchema.index({ name: 'text' });

// Fix #6 (approved pricing decision): a product must use fixed pricing OR
// variant pricing, never both. The `price` field's conditional `required`
// above already covers "neither" (no variants AND no price). This hook
// covers "both" (variants present AND a fixed price also set) — the one
// case a plain `required` function can't express on its own.
//
// This is document-level validation (`.validate()`/`.save()`/`.create()`)
// — it does NOT run for `findByIdAndUpdate`/`updateOne` with
// `runValidators: true` (Mongoose only runs per-path validators for query-
// based updates, not document middleware). The admin controllers that can
// change price/variants together (createProduct, updateProduct) therefore
// use fetch-mutate-`.save()` rather than `findByIdAndUpdate`, specifically
// so this hook always runs — see adminProductController.js.
// Mongoose 9 dropped callback-style (`next`) middleware — hooks are plain
// (async) functions now, resolved/rejected via the returned promise.
productSchema.pre('validate', function () {
  const hasVariants = Array.isArray(this.variants) && this.variants.length > 0;
  const hasFixedPrice = this.price !== undefined && this.price !== null;
  if (hasVariants && hasFixedPrice) {
    this.invalidate(
      'price',
      'A product cannot have both a fixed price and variants — use one pricing mode, not both.',
      this.price
    );
  }
});

module.exports = mongoose.model('Product', productSchema);
