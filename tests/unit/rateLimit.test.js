// Round 6 review fix: the integration suite's ordinary login setup
// overhead (one login per test, in a shared beforeEach) was tripping the
// production login rate limiter well before any test intentionally
// exercised it, because several integration files run more than 10
// tests against one Express app instance. src/middleware/rateLimit.js
// now only raises `max` when NODE_ENV === 'test' (never a
// deployment-configurable value); PRODUCTION_MAX/PRODUCTION_WINDOW_MS
// are untouched. This file proves:
//   1. the production ceiling itself is unchanged (10 / 15 min),
//      regardless of NODE_ENV, by re-requiring the module fresh under a
//      non-test NODE_ENV;
//   2. this test run (NODE_ENV=test, set only by `cross-env NODE_ENV=test`
//      in package.json's own test scripts) gets the raised test-only max,
//      with the window left untouched;
//   3. the underlying express-rate-limit mechanism — the same library,
//      construction, and response shape production uses — genuinely
//      enforces a 429 with the documented body once its configured max
//      is exceeded, so raising the test-only ceiling does not mean the
//      enforcement logic itself is untested or broken.
const express = require('express');
const request = require('supertest');
const rateLimit = require('express-rate-limit');

describe('rateLimit.js — login limiter configuration', () => {
  test('PRODUCTION_MAX/PRODUCTION_WINDOW_MS are the documented, fixed ceiling', () => {
    const { PRODUCTION_MAX, PRODUCTION_WINDOW_MS } = require('../../src/middleware/rateLimit');
    expect(PRODUCTION_MAX).toBe(10);
    expect(PRODUCTION_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  test('outside the test environment, configuredMax/configuredWindowMs equal the production ceiling exactly', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    try {
      const { configuredMax, configuredWindowMs, PRODUCTION_MAX, PRODUCTION_WINDOW_MS } = require('../../src/middleware/rateLimit');
      expect(configuredMax).toBe(PRODUCTION_MAX);
      expect(configuredWindowMs).toBe(PRODUCTION_WINDOW_MS);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      jest.resetModules();
    }
  });

  test('under NODE_ENV=test (this test run), configuredMax is raised but configuredWindowMs is not', () => {
    // Ambient NODE_ENV is already "test" here (cross-env NODE_ENV=test in
    // package.json's own `test` script) — no need to force it.
    const { configuredMax, configuredWindowMs, PRODUCTION_MAX, PRODUCTION_WINDOW_MS } = require('../../src/middleware/rateLimit');
    expect(configuredMax).toBeGreaterThan(PRODUCTION_MAX);
    expect(configuredWindowMs).toBe(PRODUCTION_WINDOW_MS);
  });

  test('the underlying express-rate-limit mechanism enforces a 429 with the documented body once its configured max is exceeded', async () => {
    // A small, independently-constructed limiter — same library, same
    // options shape and message as production — proves the enforcement
    // mechanism itself still works, without needing to fire 10+ requests
    // against the real (now test-raised) production singleton.
    const smallLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { message: 'Too many login attempts. Please try again later.' } },
    });

    // express-rate-limit v8 validates req.app (trust proxy settings,
    // etc.), so this needs a real (minimal) Express app rather than a
    // bare http.Server — matching how the production middleware is
    // actually mounted.
    const app = express();
    app.get('/', smallLimiter, (req, res) => res.status(200).json({ ok: true }));

    const agent = request.agent(app);
    const first = await agent.get('/');
    const second = await agent.get('/');
    const third = await agent.get('/');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: { message: 'Too many login attempts. Please try again later.' } });
  });
});
