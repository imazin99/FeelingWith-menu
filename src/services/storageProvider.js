const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;
const env = require('../config/env');

// Architecture doc, section 5: all image operations go through one
// StorageProvider interface — upload(file) -> { url, key }, delete(key) —
// so Products/AddOns logic never calls a filesystem or cloud SDK directly,
// and no image binary is ever stored in MongoDB (only url/key strings).

class LocalDiskProvider {
  constructor() {
    this.uploadDir = path.resolve(process.cwd(), env.localUploadDir);
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // file: { buffer, originalname, mimetype } (as produced by multer memoryStorage)
  async upload(file, extension) {
    const key = `${crypto.randomUUID()}${extension}`;
    const destPath = path.join(this.uploadDir, key);
    await fs.promises.writeFile(destPath, file.buffer);
    return {
      key,
      url: `/uploads/${key}`,
    };
  }

  async delete(key) {
    if (!key) return;
    const targetPath = path.join(this.uploadDir, key);
    // Never throw if the file is already gone — delete is best-effort cleanup.
    try {
      await fs.promises.unlink(targetPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

// Phase 05B: the real, owner-approved production provider (Phase 05A §4
// recommendation — Cloudinary — approved in the Phase 05B brief). Replaces
// the earlier CloudStorageProvider stub; implements the exact same
// interface (upload(file, extension) -> {url, key}, delete(key)) so no
// caller (adminProductController.js, adminSettingsController.js) needed to
// change at all.
class CloudinaryProvider {
  constructor() {
    const { cloudName, apiKey, apiSecret } = env.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'CloudinaryProvider selected (STORAGE_PROVIDER=cloud, or NODE_ENV=production with no ' +
          'override) but CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are ' +
          'not fully set. See .env.example.'
      );
    }
    this.folder = env.cloudinary.folder;
    // Configuring the SDK is process-global by design (this is how the
    // Cloudinary SDK itself works) — safe here because this app only ever
    // runs with one set of credentials for its whole lifetime, and the
    // credentials are read exclusively from environment variables, never
    // hardcoded.
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  // file: { buffer, originalname, mimetype } (as produced by multer memoryStorage).
  // extension is accepted to satisfy the shared interface but isn't needed
  // here — Cloudinary infers the format from the uploaded bytes itself and
  // generates its own unique public_id, so the original filename/extension
  // never influences the stored name (same "never trust the original
  // filename" property LocalDiskProvider has, just achieved differently).
  // eslint-disable-next-line no-unused-vars
  async upload(file, extension) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: this.folder, resource_type: 'image' },
        (err, result) => {
          if (err) {
            reject(new Error(`Cloudinary upload failed: ${err.message || 'unknown error'}`));
            return;
          }
          resolve({ url: result.secure_url, key: result.public_id });
        }
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  async delete(key) {
    if (!key) return;
    let result;
    try {
      result = await cloudinary.uploader.destroy(key, { resource_type: 'image' });
    } catch (err) {
      throw new Error(`Cloudinary delete failed: ${err.message || 'unknown error'}`);
    }
    // Cloudinary's destroy() resolves (never rejects) with { result: 'ok' }
    // on success and { result: 'not found' } when the asset is already
    // gone — mirror LocalDiskProvider's "delete is best-effort cleanup,
    // never throw if it's already gone" behavior for that second case.
    // Anything else is a real, unexpected failure worth surfacing.
    if (result && result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Cloudinary delete failed: unexpected result "${result.result}"`);
    }
  }
}

let instance = null;

function getStorageProvider() {
  if (instance) return instance;
  if (env.storageProvider === 'cloud') {
    instance = new CloudinaryProvider();
  } else {
    instance = new LocalDiskProvider();
  }
  return instance;
}

module.exports = { getStorageProvider, LocalDiskProvider, CloudinaryProvider };
