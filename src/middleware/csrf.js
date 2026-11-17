const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// Code review fix #1 ("review the double-submit implementation against
// cookie injection risks"): a plain, non-HttpOnly cookie named "csrfToken"
// is vulnerable to cross-subdomain cookie injection — if an attacker ever
// controls script execution on a sibling subdomain (e.g. via a separate
// vulnerable service on *.the-same-parent-domain), they can set their own
// "csrfToken" cookie scoped with `Domain=<parent-domain>`, which the
// browser will then attach to requests to THIS origin too. Because
// SameSite=Strict still allows requests that originate from that same
// registrable domain, that attacker-chosen cookie value would reach this
// API and — since double-submit only checks that the header matches
// whatever cookie arrives — the attacker could simply also send their own
// chosen value as the X-CSRF-Token header, defeating the whole scheme.
//
// The standard mitigation is the `__Host-` cookie name prefix: browsers
// refuse to ever store a cookie named `__Host-...` unless it has
// Secure, Path=/, and NO Domain attribute — i.e. they enforce, at the
// browser level, that the cookie can only ever be set by this exact host
// (never a parent or sibling domain). `__Host-` requires Secure, so it can
// only be used once the app is actually served over HTTPS (production);
// in development (HTTP, Secure: false) the prefix would be silently
// rejected by the browser and break the dashboard entirely, so the plain
// name remains in use there — a documented, deliberately scoped exception,
// consistent with fix #2's "development defaults may remain only if safely
// restricted to development."
const CSRF_COOKIE_PROD = '__Host-csrfToken';
const CSRF_COOKIE_DEV = 'csrfToken';
const CSRF_COOKIE = env.nodeEnv === 'production' ? CSRF_COOKIE_PROD : CSRF_COOKIE_DEV;
const CSRF_HEADER = 'x-csrf-token';

// Architecture doc, section 3: a double-submit CSRF token, generated and
// validated server-side — not reliance on SameSite alone.
//
// 1. Generation: issued alongside the session cookie, as a separate,
//    non-HttpOnly cookie (readable by the dashboard's own JS, unreadable by
//    a cross-origin page under same-origin policy).
// 2. Inclusion: the client reads the cookie and sends it back as the
//    X-CSRF-Token header on every state-changing request.
// 3. Validation: this middleware rejects a state-changing request whose
//    header is missing or doesn't match the cookie on that same request,
//    AND whose Origin (or Referer, as a fallback) doesn't match this app's
//    own origin — see requireCsrf below for the Origin policy.
// 4. Lifecycle: reissued on login, cleared on logout. No server-side store —
//    validation is a same-request cookie-vs-header comparison.
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
    // No `domain` attribute, ever — host-only by default. Required for
    // `__Host-` cookies (the browser enforces this), and good practice for
    // the dev-mode plain cookie too, so it is never accidentally widened
    // to the parent domain if the app is one day deployed under a
    // subdomain.
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Code review fix #1 (Origin validation): the expected origin is this
// request's own scheme+host — the API and the admin dashboard are served
// from the same Express app, same-origin by design (README, "CORS"). An
// operator that intentionally serves the dashboard from a separate, known
// origin can allow it explicitly via the ALLOWED_ORIGINS env var
// (comma-separated), read once into env.allowedOrigins.
//
// Deployment clarification (final review): behind a TLS-terminating
// reverse proxy, `req.protocol` reflects the proxy's internal (often
// plain HTTP) connection to this process, not the public HTTPS origin a
// real browser used — see the long comment in src/config/env.js for why
// this is fixed via the explicit APP_ORIGIN setting rather than by
// trusting X-Forwarded-* headers. When APP_ORIGIN is configured, it is
// the canonical origin, full stop — no per-request derivation, no proxy
// trust needed.
function selfOrigin(req) {
  if (env.appOrigin) return env.appOrigin;
  return `${req.protocol}://${req.get('host')}`;
}

function originIsAllowed(origin, req) {
  if (!origin) return false;
  if (origin === selfOrigin(req)) return true;
  return env.allowedOrigins.includes(origin);
}

// Documented policy for a missing/invalid Origin (fix #1: "handle missing
// or invalid Origin safely, with a documented policy"):
//   - If the Origin header is present, it must match an allowed origin —
//     otherwise the request is rejected (403), regardless of whether the
//     CSRF cookie/header pair would have matched.
//   - If Origin is absent (older browsers/proxies sometimes omit it on
//     same-origin requests), fall back to the Referer header's origin
//     component, validated the same way.
//   - If a Referer is present but is not a well-formed absolute URL, it is
//     treated as invalid (rejected), not as absent.
//   - If BOTH Origin and Referer are absent, the request is rejected. Per
//     OWASP's CSRF-prevention guidance, a legitimate browser-originated
//     state-changing request carries at least one of these headers in
//     virtually every real deployment; treating their total absence as
//     "trust it anyway" would quietly reopen the exact cross-site
//     forgery this middleware exists to stop. A same-origin, non-browser
//     caller (e.g. a server-to-server job) is not expected to rely on this
//     cookie-based admin session in the first place.
function resolveRequestOrigin(req) {
  const originHeader = req.get('Origin');
  if (originHeader) return originHeader;

  const referer = req.get('Referer') || req.get('Referrer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid'; // malformed Referer — never matches an allowed origin
  }
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const requestOrigin = resolveRequestOrigin(req);
  if (!requestOrigin) {
    return next(ApiError.forbidden('Missing Origin/Referer on a state-changing request.'));
  }
  if (!originIsAllowed(requestOrigin, req)) {
    return next(ApiError.forbidden('Request Origin is not allowed.'));
  }

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken) {
    return next(ApiError.forbidden('Missing CSRF token.'));
  }

  // Constant-time comparison to avoid leaking the token via timing.
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(ApiError.forbidden('Invalid CSRF token.'));
  }

  next();
}

module.exports = {
  CSRF_COOKIE,
  CSRF_HEADER,
  generateCsrfToken,
  csrfCookieOptions,
  requireCsrf,
  // Exported for tests only — not used by application code.
  _internal: { originIsAllowed, resolveRequestOrigin, selfOrigin },
};
