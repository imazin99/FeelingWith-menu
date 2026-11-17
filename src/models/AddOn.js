const mongoose = require('mongoose');

// Architecture doc — Schema Reference / AddOns (new collection).
// Shared and reusable: defined once, attached to any number of Products via
// Products.addOnIds. Carries the same visibility/availability/archived
// tri-state as Products (confirmed in final review). No image field
// (confirmed — text-and-price only in this phase).
const addOnSchema = new mongoose.Schema(
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
    },
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
  },
  { timestamps: true }
);

addOnSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
addOnSchema.index({ isVisible: 1, isAvailable: 1, isArchived: 1 });

module.exports = mongoose.model('AddOn', addOnSchema);
