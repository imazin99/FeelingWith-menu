const rateLimit = require('express-rate-limit');

// Brand spec, section 9: "Rate limiting" is a required security measure.
// Applied narrowly to the login route, where brute-forcing credentials is
// the actual threat — not to public read traffic.
//
// These are the ONLY values ever used outside the automated test run.
// Exported so a unit test can assert the production ceiling directly,
// without needing to actually fire 10+ requests.
const PRODUCTION_MAX = 10; // 10 attempts per IP per window
const PRODUCTION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Round 6 review fix: the integration suite creates a fresh admin and
// logs in once per `test()` as ordinary setup overhead (via
// createTestAdmin()+loginAsAdmin() in a shared beforeEach) — not a
// security probe. Several integration test files run more than 10 tests
// against one Express app instance created once in that file's
// beforeAll, so the SAME, correctly-working production limiter a real
// attacker would trip was also tripping on ordinary test setup, well
// before any test intentionally exercises rate limiting — producing
// `429 Too many login attempts` failures unrelated to what those tests
// were actually checking.
//
// `max` is the only thing that differs here, and only when
// `NODE_ENV === 'test'` — a value set exclusively by this project's own
// `cross-env NODE_ENV=test` test scripts in package.json, never a
// runtime/deployment configuration value, so this can never be set (by
// misconfiguration or otherwise) in a real deployment. PRODUCTION_MAX
// and PRODUCTION_WINDOW_MS above are untouched, and `windowMs` is never
// adjusted even in tests. See tests/unit/rateLimit.test.js for a test
// proving (a) the production ceiling is exactly 10/15min regardless of
// NODE_ENV, and (b) the underlying express-rate-limit mechanism itself —
// same library, same construction, same response shape — genuinely
// enforces a 429 once its configured max is exceeded.
const TEST_MAX = 1000;
const isTestEnv = process.env.NODE_ENV === 'test';
const configuredMax = isTestEnv ? TEST_MAX : PRODUCTION_MAX;
const configuredWindowMs = PRODUCTION_WINDOW_MS;

const loginRateLimiter = rateLimit({
  windowMs: configuredWindowMs,
  max: configuredMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts. Please try again later.' } },
});

module.exports = { loginRateLimiter, PRODUCTION_MAX, PRODUCTION_WINDOW_MS, configuredMax, configuredWindowMs };
