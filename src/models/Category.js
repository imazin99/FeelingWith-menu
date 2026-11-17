const mongoose = require('mongoose');

// Architecture doc — Schema Reference / Categories.
// isArchived (confirmed): soft-delete, parallel to Products. A hidden or
// archived category excludes all of its products from the public API
// (cascade rule implemented in publicMenuController, not stored per-product).
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    displayOrder: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // Independent category image (owner-approved enhancement): same
    // storage-provider abstraction and url/key split as Product's own
    // imageUrl/imageKey (section 5) — imageUrl is the public, servable
    // URL; imageKey is the internal storage reference (local filename or
    // Cloudinary public_id) used only for replace/delete, never exposed
    // by the public API.
    imageUrl: {
      type: String,
      default: undefined,
    },
    imageKey: {
      type: String,
      default: undefined,
    },
    isVisible: {
      type: Boolean,
      required: true,
      default: true,
    },
    isArchived: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  { timestamps: true }
);

// Unique, case-insensitive name — prevents "Hot Coffee" / "hot coffee" duplicates.
categorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
categorySchema.index({ displayOrder: 1 });
categorySchema.index({ isVisible: 1, isArchived: 1 });

module.exports = mongoose.model('Category', categorySchema);
