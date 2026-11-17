const fs = require('fs');
const path = require('path');
const os = require('os');

describe('LocalDiskProvider', () => {
  let tmpDir;
  let LocalDiskProvider;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwm-upload-test-'));
    // storageProvider.js resolves its directory from process.cwd() + env.localUploadDir,
    // so point both at an isolated temp dir for this test, and re-require fresh.
    process.env.LOCAL_UPLOAD_DIR = tmpDir;
    jest.resetModules();
    ({ LocalDiskProvider } = require('../../src/services/storageProvider'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.LOCAL_UPLOAD_DIR;
  });

  test('upload() writes the file under a generated name, never the original filename', async () => {
    const provider = new LocalDiskProvider();
    const fakeFile = {
      buffer: Buffer.from('fake-image-bytes'),
      originalname: '../../etc/passwd.png',
    };

    const { key, url } = await provider.upload(fakeFile, '.png');

    expect(key).not.toContain('passwd');
    expect(key).not.toContain('..');
    expect(key.endsWith('.png')).toBe(true);
    expect(url).toBe(`/uploads/${key}`);

    const writtenPath = path.join(tmpDir, key);
    expect(fs.existsSync(writtenPath)).toBe(true);
    expect(fs.readFileSync(writtenPath)).toEqual(fakeFile.buffer);
  });

  test('delete() removes a previously uploaded file', async () => {
    const provider = new LocalDiskProvider();
    const { key } = await provider.upload({ buffer: Buffer.from('x') }, '.jpg');
    expect(fs.existsSync(path.join(tmpDir, key))).toBe(true);

    await provider.delete(key);
    expect(fs.existsSync(path.join(tmpDir, key))).toBe(false);
  });

  test('delete() on a non-existent key is a silent no-op (never throws)', async () => {
    const provider = new LocalDiskProvider();
    await expect(provider.delete('does-not-exist.png')).resolves.toBeUndefined();
  });

  test('delete() with no key is a silent no-op', async () => {
    const provider = new LocalDiskProvider();
    await expect(provider.delete(undefined)).resolves.toBeUndefined();
  });
});

// Phase 05B: CloudinaryProvider — the real, owner-approved production
// provider. The actual 'cloudinary' SDK is mocked throughout; nothing here
// contacts a real Cloudinary account or requires real credentials, per the
// brief's explicit instruction. These are unit tests only.
describe('CloudinaryProvider', () => {
  const REAL_ENV = { ...process.env };

  function setCreds() {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
  }

  afterEach(() => {
    process.env = { ...REAL_ENV };
    jest.resetModules();
    jest.dontMock('cloudinary');
  });

  test('throws a clear configuration error when CLOUDINARY_* env vars are unset', () => {
    jest.resetModules();
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    expect(() => new CloudinaryProvider()).toThrow(/CLOUDINARY_CLOUD_NAME/);
  });

  test('configures the SDK from env vars, never with hardcoded values', () => {
    jest.resetModules();
    setCreds();
    const configMock = jest.fn();
    jest.doMock('cloudinary', () => ({
      v2: { config: configMock, uploader: { upload_stream: jest.fn(), destroy: jest.fn() } },
    }));
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    // eslint-disable-next-line no-new
    new CloudinaryProvider();
    expect(configMock).toHaveBeenCalledWith({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
      secure: true,
    });
  });

  test('upload() resolves {url, key} from a successful Cloudinary response', async () => {
    jest.resetModules();
    setCreds();
    const fakeStream = { end: jest.fn() };
    const uploadStream = jest.fn((options, callback) => {
      callback(null, { secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/abc123.jpg', public_id: 'feeling-with-menu/abc123' });
      return fakeStream;
    });
    jest.doMock('cloudinary', () => ({
      v2: { config: jest.fn(), uploader: { upload_stream: uploadStream, destroy: jest.fn() } },
    }));
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    const provider = new CloudinaryProvider();

    const result = await provider.upload({ buffer: Buffer.from('fake-image-bytes') }, '.jpg');

    expect(result).toEqual({
      url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/abc123.jpg',
      key: 'feeling-with-menu/abc123',
    });
    expect(uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({ resource_type: 'image' }),
      expect.any(Function)
    );
  });

  test('upload() rejects with a clear error when Cloudinary reports a failure', async () => {
    jest.resetModules();
    setCreds();
    const uploadStream = jest.fn((options, callback) => {
      callback(new Error('network timeout'), null);
      return { end: jest.fn() };
    });
    jest.doMock('cloudinary', () => ({
      v2: { config: jest.fn(), uploader: { upload_stream: uploadStream, destroy: jest.fn() } },
    }));
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    const provider = new CloudinaryProvider();

    await expect(provider.upload({ buffer: Buffer.from('x') }, '.png')).rejects.toThrow(
      /Cloudinary upload failed: network timeout/
    );
  });

  test('delete() resolves cleanly on a successful deletion', async () => {
    jest.resetModules();
    setCreds();
    const destroy = jest.fn().mockResolvedValue({ result: 'ok' });
    jest.doMock('cloudinary', () => ({
      v2: { config: jest.fn(), uploader: { upload_stream: jest.fn(), destroy } },
    }));
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    const provider = new CloudinaryProvider();

    await expect(provider.delete('feeling-with-menu/abc123')).resolves.toBeUndefined();
    expect(destroy).toHaveBeenCalledWith('feeling-with-menu/abc123', { resource_type: 'image' });
  });

  test('delete() treats an already-missing asset ("not found") as success, like LocalDiskProvider', async () => {
    jest.resetModules();
    setCreds();
    const destroy = jest.fn().mockResolvedValue({ result: 'not found' });
    jest.doMock('cloudinary', () => ({
      v2: { config: jest.fn(), uploader: { upload_stream: jest.fn(), destroy } },
    }));
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    const provider = new CloudinaryProvider();

    await expect(provider.delete('already-gone')).resolves.toBeUndefined();
  });

  test('delete() with no key is a silent no-op (never calls the SDK)', async () => {
    jest.resetModules();
    setCreds();
    const destroy = jest.fn();
    jest.doMock('cloudinary', () => ({
      v2: { config: jest.fn(), uploader: { upload_stream: jest.fn(), destroy } },
    }));
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    const provider = new CloudinaryProvider();

    await expect(provider.delete(undefined)).resolves.toBeUndefined();
    expect(destroy).not.toHaveBeenCalled();
  });

  test('delete() rejects with a clear error on a real, unexpected failure', async () => {
    jest.resetModules();
    setCreds();
    const destroy = jest.fn().mockRejectedValue(new Error('rate limited'));
    jest.doMock('cloudinary', () => ({
      v2: { config: jest.fn(), uploader: { upload_stream: jest.fn(), destroy } },
    }));
    const { CloudinaryProvider } = require('../../src/services/storageProvider');
    const provider = new CloudinaryProvider();

    await expect(provider.delete('abc123')).rejects.toThrow(/Cloudinary delete failed: rate limited/);
  });
});

describe('getStorageProvider', () => {
  test('STORAGE_PROVIDER=local (default outside production) returns a LocalDiskProvider', () => {
    jest.resetModules();
    process.env.STORAGE_PROVIDER = 'local';
    const { getStorageProvider, LocalDiskProvider } = require('../../src/services/storageProvider');
    expect(getStorageProvider()).toBeInstanceOf(LocalDiskProvider);
    delete process.env.STORAGE_PROVIDER;
  });

  test('STORAGE_PROVIDER=cloud returns a CloudinaryProvider (given valid credentials)', () => {
    jest.resetModules();
    process.env.STORAGE_PROVIDER = 'cloud';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    jest.doMock('cloudinary', () => ({
      v2: { config: jest.fn(), uploader: { upload_stream: jest.fn(), destroy: jest.fn() } },
    }));
    const { getStorageProvider, CloudinaryProvider } = require('../../src/services/storageProvider');
    expect(getStorageProvider()).toBeInstanceOf(CloudinaryProvider);
    delete process.env.STORAGE_PROVIDER;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    jest.dontMock('cloudinary');
  });
});
