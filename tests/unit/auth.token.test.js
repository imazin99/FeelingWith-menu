const jwt = require('jsonwebtoken');

// Pure JWT signing/cookie-options logic — no database needed. requireAuth
// itself (which also does a User lookup) is covered in the integration
// suite (tests/integration/auth.test.js).
describe('signSessionToken / sessionCookieOptions', () => {
  let signSessionToken;
  let sessionCookieOptions;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '8h';
    ({ signSessionToken, sessionCookieOptions } = require('../../src/middleware/auth'));
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
  });

  test('signs a token carrying the user id and tokenVersion as claims', () => {
    const fakeUser = { _id: { toString: () => '64f0000000000000000000aa' }, tokenVersion: 3 };
    const token = signSessionToken(fakeUser);
    const decoded = jwt.verify(token, 'test-secret');
    expect(decoded.sub).toBe('64f0000000000000000000aa');
    expect(decoded.tokenVersion).toBe(3);
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  test('a token signed for tokenVersion 0 fails verification once the secret differs', () => {
    const fakeUser = { _id: { toString: () => 'abc' }, tokenVersion: 0 };
    const token = signSessionToken(fakeUser);
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });

  test('sessionCookieOptions sets HttpOnly, SameSite=Strict, and Secure only in production', () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    process.env.JWT_SECRET = 'test-secret';
    ({ sessionCookieOptions } = require('../../src/middleware/auth'));
    let opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('strict');
    expect(opts.secure).toBe(false);

    process.env.NODE_ENV = 'production';
    jest.resetModules();
    process.env.JWT_SECRET = 'test-secret';
    // Phase 05B: env.js also now refuses to load in production without a
    // real MONGODB_URI — unrelated to what this test checks, just satisfy it.
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/feeling_with_menu';
    ({ sessionCookieOptions } = require('../../src/middleware/auth'));
    opts = sessionCookieOptions();
    expect(opts.secure).toBe(true);

    process.env.NODE_ENV = 'test';
  });
});
