const { generateCsrfToken, requireCsrf, CSRF_COOKIE, CSRF_HEADER } = require('../../src/middleware/csrf');

const SELF_HOST = 'app.feelingwith.test';
const SELF_ORIGIN = `http://${SELF_HOST}`;

function mockReq({ method = 'POST', cookies = {}, headers = {}, protocol = 'http', host = SELF_HOST } = {}) {
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }
  return {
    method,
    cookies,
    protocol,
    get(name) {
      const lower = name.toLowerCase();
      if (lower === 'host') return host;
      return normalizedHeaders[lower];
    },
  };
}

describe('generateCsrfToken', () => {
  test('produces a long, high-entropy hex string, different every call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toEqual(b);
  });
});

describe('requireCsrf — double-submit validation (unchanged behavior, now reached only after Origin passes)', () => {
  test('passes through safe methods (GET) without checking Origin or tokens at all', () => {
    const req = mockReq({ method: 'GET' });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next).toHaveBeenCalledWith(); // called with no error
  });

  test('rejects a state-changing request with no cookie and no header (even with a valid Origin)', () => {
    const req = mockReq({ method: 'POST', headers: { origin: SELF_ORIGIN } });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
  });

  test('rejects when only the cookie is present (header missing — the forged-request case)', () => {
    const token = generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE]: token },
      headers: { origin: SELF_ORIGIN },
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('rejects when the header does not match the cookie', () => {
    const req = mockReq({
      method: 'PATCH',
      cookies: { [CSRF_COOKIE]: generateCsrfToken() },
      headers: { [CSRF_HEADER]: generateCsrfToken(), origin: SELF_ORIGIN },
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('accepts when the header exactly matches the cookie and the Origin is this server\'s own origin', () => {
    const token = generateCsrfToken();
    const req = mockReq({
      method: 'DELETE',
      cookies: { [CSRF_COOKIE]: token },
      headers: { [CSRF_HEADER]: token, origin: SELF_ORIGIN },
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next).toHaveBeenCalledWith(); // no error
  });
});

describe('requireCsrf — Origin validation (code review fix #1)', () => {
  test('rejects a cross-origin request even when the CSRF cookie/header pair matches perfectly', () => {
    const token = generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE]: token },
      headers: { [CSRF_HEADER]: token, origin: 'https://evil-attacker.example.com' },
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('rejects when both Origin and Referer are absent — documented "total absence is not trusted" policy', () => {
    const token = generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE]: token },
      headers: { [CSRF_HEADER]: token }, // no origin, no referer
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('falls back to Referer when Origin is absent, and accepts a matching one', () => {
    const token = generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE]: token },
      headers: { [CSRF_HEADER]: token, referer: `${SELF_ORIGIN}/admin/categories` },
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('rejects a mismatching Referer the same way as a mismatching Origin', () => {
    const token = generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE]: token },
      headers: { [CSRF_HEADER]: token, referer: 'https://evil-attacker.example.com/form' },
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('treats a malformed Referer as invalid, not as absent', () => {
    const token = generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE]: token },
      headers: { [CSRF_HEADER]: token, referer: 'not a url at all' },
    });
    const next = jest.fn();
    requireCsrf(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  test('accepts an Origin explicitly configured via ALLOWED_ORIGINS, in addition to the self-origin', () => {
    jest.resetModules();
    const ORIGINAL_ENV = { ...process.env };
    process.env.NODE_ENV = 'development';
    process.env.ALLOWED_ORIGINS = 'https://dashboard.feelingwith.example';
    const {
      requireCsrf: requireCsrfWithAllowList,
      generateCsrfToken: genToken,
      CSRF_COOKIE: cookieName,
      CSRF_HEADER: headerName,
    } = require('../../src/middleware/csrf');

    const token = genToken();
    const req = mockReq({
      method: 'POST',
      cookies: { [cookieName]: token },
      headers: { [headerName]: token, origin: 'https://dashboard.feelingwith.example' },
    });
    const next = jest.fn();
    requireCsrfWithAllowList(req, {}, next);
    expect(next).toHaveBeenCalledWith();

    process.env = ORIGINAL_ENV;
    jest.resetModules();
  });
});

describe('selfOrigin / APP_ORIGIN — reverse-proxy deployment clarification', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('without APP_ORIGIN, Origin validation uses the request\'s own (possibly proxy-internal) protocol+host', () => {
    jest.resetModules();
    const ORIGINAL_ENV = { ...process.env };
    process.env.NODE_ENV = 'development';
    delete process.env.APP_ORIGIN;
    const freshCsrf = require('../../src/middleware/csrf');

    const token = freshCsrf.generateCsrfToken();
    // Simulates exactly the reverse-proxy failure mode this fix documents:
    // Express sees the proxy's internal plain-HTTP connection (req.protocol
    // = 'http'), but the real browser sent the public HTTPS origin.
    const req = mockReq({
      method: 'POST',
      protocol: 'http',
      host: 'menu.feelingwith.com',
      cookies: { [freshCsrf.CSRF_COOKIE]: token },
      headers: { [freshCsrf.CSRF_HEADER]: token, origin: 'https://menu.feelingwith.com' },
    });
    const next = jest.fn();
    freshCsrf.requireCsrf(req, {}, next);
    // Without APP_ORIGIN configured, this legitimate same-origin HTTPS
    // request is wrongly rejected — demonstrating exactly the bug the
    // APP_ORIGIN setting exists to fix.
    expect(next.mock.calls[0][0].statusCode).toBe(403);

    process.env = ORIGINAL_ENV;
  });

  test('with APP_ORIGIN configured, the same reverse-proxied request is correctly accepted', () => {
    jest.resetModules();
    const ORIGINAL_ENV = { ...process.env };
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = 'https://menu.feelingwith.com';
    const freshCsrf = require('../../src/middleware/csrf');

    const token = freshCsrf.generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      protocol: 'http', // still the proxy's internal view
      host: 'menu.feelingwith.com',
      cookies: { [freshCsrf.CSRF_COOKIE]: token },
      headers: { [freshCsrf.CSRF_HEADER]: token, origin: 'https://menu.feelingwith.com' },
    });
    const next = jest.fn();
    freshCsrf.requireCsrf(req, {}, next);
    expect(next).toHaveBeenCalledWith(); // accepted — no error

    process.env = ORIGINAL_ENV;
  });

  test('with APP_ORIGIN configured, a request claiming a different Origin is still rejected', () => {
    jest.resetModules();
    const ORIGINAL_ENV = { ...process.env };
    process.env.NODE_ENV = 'development';
    process.env.APP_ORIGIN = 'https://menu.feelingwith.com';
    const freshCsrf = require('../../src/middleware/csrf');

    const token = freshCsrf.generateCsrfToken();
    const req = mockReq({
      method: 'POST',
      protocol: 'http',
      host: 'menu.feelingwith.com',
      cookies: { [freshCsrf.CSRF_COOKIE]: token },
      headers: { [freshCsrf.CSRF_HEADER]: token, origin: 'https://evil-attacker.example.com' },
    });
    const next = jest.fn();
    freshCsrf.requireCsrf(req, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);

    process.env = ORIGINAL_ENV;
  });
});

describe('CSRF cookie naming — cookie-injection hardening (code review fix #1)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('uses the __Host- prefixed cookie name in production, which browsers refuse to scope beyond this exact host', () => {
    const ORIGINAL_ENV = { ...process.env };
    process.env.NODE_ENV = 'production';
    // env.js (fix #2) refuses to load in production without a real
    // JWT_SECRET — supply one so this test exercises csrf.js's own
    // production behavior, not env.js's unrelated guard.
    process.env.JWT_SECRET = 'a-long-random-production-secret-value-for-tests';
    // Phase 05B: env.js also now refuses to load in production without a
    // real MONGODB_URI (same class of guard as JWT_SECRET) — irrelevant to
    // what this test actually exercises, so just satisfy it.
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/feeling_with_menu';
    jest.resetModules();
    const prodCsrf = require('../../src/middleware/csrf');
    expect(prodCsrf.CSRF_COOKIE).toBe('__Host-csrfToken');

    const cookieOpts = prodCsrf.csrfCookieOptions();
    // __Host- is only honored by browsers when these hold; assert the
    // server actually sets them, not just the name.
    expect(cookieOpts.secure).toBe(true);
    expect(cookieOpts.path).toBe('/');
    expect(cookieOpts.domain).toBeUndefined();

    process.env = ORIGINAL_ENV;
  });

  test('uses the plain cookie name in development (where __Host- would be silently rejected over HTTP)', () => {
    const ORIGINAL_ENV = { ...process.env };
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    const devCsrf = require('../../src/middleware/csrf');
    expect(devCsrf.CSRF_COOKIE).toBe('csrfToken');
    expect(devCsrf.csrfCookieOptions().secure).toBe(false);

    process.env = ORIGINAL_ENV;
  });
});
