const mongoose = require('mongoose');

// Architecture doc — Schema Reference / Settings.
// Single document, enforced here via a fixed well-known _id ("singleton")
// that every read/write targets — never a free-form query. Editable-now vs.
// deferred split confirmed in final review.
const SINGLETON_ID = 'singleton';

const contactSchema = new mongoose.Schema(
  {
    phone: { type: String, trim: true, default: undefined },
    email: { type: String, trim: true, lowercase: true, default: undefined },
    address: { type: String, trim: true, maxlength: 200, default: undefined },
  },
  { _id: false }
);

const socialLinksSchema = new mongoose.Schema(
  {
    instagram: { type: String, trim: true, default: undefined },
    facebook: { type: String, trim: true, default: undefined },
    tiktok: { type: String, trim: true, default: undefined },
    website: { type: String, trim: true, default: undefined },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SINGLETON_ID },
    cafeName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
      default: 'Feeling With',
    },
    tagline: {
      type: String,
      trim: true,
      maxlength: 150,
      default: undefined,
    },
    logoUrl: {
      type: String,
      default: undefined,
    },
    logoKey: {
      type: String,
      default: undefined,
    },
    contact: {
      type: contactSchema,
      default: () => ({}),
    },
    socialLinks: {
      type: socialLinksSchema,
      default: () => ({}),
    },
    language: {
      type: String,
      enum: ['en', 'ar'],
      required: true,
      default: 'en',
    },
    isRtl: {
      type: Boolean,
      required: true,
      default: false,
    },
    // Deferred (confirmed): layout customization, card styles, display
    // density, advanced menu display configuration. No backing fields are
    // defined for these yet — see the architecture doc, section 7.
  },
  { timestamps: true, _id: false }
);

// Used by the ADMIN API only (getSettings, updateSettings's upsert,
// uploadLogo) — creating the singleton on first access there is fine
// because those routes are already authenticated writes.
settingsSchema.statics.getSingleton = async function getSingleton() {
  let doc = await this.findById(SINGLETON_ID);
  if (!doc) {
    doc = await this.create({ _id: SINGLETON_ID });
  }
  return doc;
};

// Final review fix #1: the PUBLIC settings endpoint must be strictly
// read-only — an unauthenticated GET must never cause a write. This
// returns the persisted singleton if one exists, or an in-memory,
// never-saved `Settings` instance (schema defaults only: cafeName
// "Feeling With", language "en", isRtl false, empty contact/socialLinks)
// if one doesn't. Nothing is written to MongoDB either way.
settingsSchema.statics.getPublicSingleton = async function getPublicSingleton() {
  const doc = await this.findById(SINGLETON_ID);
  return doc || new this({});
};

module.exports = mongoose.model('Settings', settingsSchema);
module.exports.SINGLETON_ID = SINGLETON_ID;
