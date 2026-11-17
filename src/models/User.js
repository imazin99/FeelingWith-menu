const mongoose = require('mongoose');

// Architecture doc — Schema Reference / Users.
// Dashboard login only. No document-count limit — any number of admin
// accounts can exist (Authentication, section 4). role is an enum, not a
// boolean, so the main system's richer role set (super_admin/owner/cashier)
// can be added later without restructuring. tokenVersion backs instant
// session revocation (section 4).
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    fullName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: undefined,
    },
    role: {
      type: String,
      enum: ['admin'], // Phase 01: single role. Enum left open for the main
      // system's super_admin/owner/cashier values later.
      required: true,
      default: 'admin',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },
    tokenVersion: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
