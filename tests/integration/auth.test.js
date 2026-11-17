const request = require('supertest');
const { createApp, connectTestDb, disconnectTestDb, clearCollections, createTestAdmin, listen, closeServer } = require('../helpers/testApp');
const { loginAsAdmin } = require('../helpers/authHelper');
const User = require('../../src/models/User');
const Category = require('../../src/models/Category');

let app;
let server;
let origin;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  ({ server, origin } = await listen(app));
});

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await disconnectTestDb();
  await closeServer(server);
});

describe('Authentication', () => {
  test('POST /api/auth/login succeeds with correct credentials and sets session + csrf cookies', async () => {
    const { username, password } = await createTestAdmin();
    const res = await request(server).post('/api/auth/login').send({ username, password });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(username);
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/session=/);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Strict/i);
    expect(cookies).toMatch(/csrfToken=/);
  });

  test('POST /api/auth/login fails with wrong password, same message as unknown user', async () => {
    const { username } = await createTestAdmin({ password: 'correct-password' });

    const wrongPassword = await request(server).post('/api/auth/login').send({ username, password: 'nope' });
    const unknownUser = await request(server).post('/api/auth/login').send({ username: 'ghost', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });

  test('GET /api/admin/categories without a session cookie is rejected with 401', async () => {
    const res = await request(server).get('/api/admin/categories');
    expect(res.status).toBe(401);
  });

  test('a logged-in admin can reach GET /api/admin/categories (no CSRF needed for GET)', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    await loginAsAdmin(agent, admin);

    const res = await agent.get('/api/admin/categories');
    expect(res.status).toBe(200);
  });
});

describe('CSRF double-submit protection (architecture doc, section 3)', () => {
  test('a state-changing admin request with a valid session but NO csrf header is rejected (403)', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    await loginAsAdmin(agent, admin);

    // Deliberately omit X-CSRF-Token even though the session cookie is valid.
    const res = await agent.post('/api/admin/categories').send({ name: 'Hot Coffee' });
    expect(res.status).toBe(403);
  });

  test('a state-changing admin request with a forged/mismatched csrf header is rejected (403)', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    await loginAsAdmin(agent, admin);

    const res = await agent
      .post('/api/admin/categories')
      .set('X-CSRF-Token', 'totally-made-up-value').set('Origin', origin)
      .send({ name: 'Hot Coffee' });
    expect(res.status).toBe(403);
  });

  test('a state-changing admin request with the matching csrf header succeeds', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    const res = await agent
      .post('/api/admin/categories')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ name: 'Hot Coffee' });
    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('Hot Coffee');
  });
});

describe('CSRF Origin validation (code review fix #1)', () => {
  test('a cross-origin request is rejected (403) even with a valid session and a correctly-matching CSRF cookie/header pair', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    // The CSRF cookie/header pair matches each other perfectly — but the
    // Origin claims to be a different site entirely. Origin validation is
    // the layer that catches exactly this (the double-submit check alone
    // would have passed).
    const res = await agent
      .post('/api/admin/categories')
      .set('X-CSRF-Token', csrfToken)
      .set('Origin', 'https://evil-attacker.example.com')
      .send({ name: 'Hot Coffee' });
    expect(res.status).toBe(403);
  });

  test('a request with neither an Origin nor a Referer header is rejected (documented policy: total absence is not trusted)', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    // supertest/superagent send neither header unless explicitly set, so
    // this reproduces the policy's "both absent" branch directly.
    const res = await agent.post('/api/admin/categories').set('X-CSRF-Token', csrfToken).send({ name: 'Hot Coffee' });
    expect(res.status).toBe(403);
  });

  test('falls back to a matching Referer when Origin is absent, and still succeeds', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    const res = await agent
      .post('/api/admin/categories')
      .set('X-CSRF-Token', csrfToken)
      .set('Referer', `${origin}/admin/categories`)
      .send({ name: 'Hot Coffee' });
    expect(res.status).toBe(201);
  });

  test('a self-consistent but entirely forged CSRF cookie/header pair is still rejected without a valid session (auth is checked first)', async () => {
    // No login at all — a bare agent with no session cookie, "forging" its
    // own matching csrfToken cookie and header. This is the cookie-
    // injection scenario fix #1 asks to review: even if an attacker could
    // somehow get their own chosen csrfToken cookie accepted by the
    // browser, it is worthless without also holding a valid, signed
    // session cookie, which requireAuth checks before requireCsrf ever
    // runs on the admin router.
    const forgedToken = 'attacker-chosen-value-0000000000000000000000000000000000000000';
    const res = await request(server)
      .post('/api/admin/categories')
      .set('Cookie', [`csrfToken=${forgedToken}`])
      .set('X-CSRF-Token', forgedToken)
      .set('Origin', origin)
      .send({ name: 'Hot Coffee' });
    expect(res.status).toBe(401);
  });
});

describe('Session revocation via tokenVersion (architecture doc, section 4)', () => {
  test('revoking a session (bumping tokenVersion) invalidates an already-issued token immediately', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    // Confirm the session works before revocation.
    const before = await agent.get('/api/admin/categories');
    expect(before.status).toBe(200);

    // A second admin revokes the first one's sessions.
    const secondAgent = request.agent(server);
    const second = await createTestAdmin({ username: 'second-admin' });
    const { csrfToken: secondCsrf } = await loginAsAdmin(secondAgent, second);
    const revokeRes = await secondAgent
      .post(`/api/admin/users/${admin.user._id}/revoke`)
      .set('X-CSRF-Token', secondCsrf).set('Origin', origin);
    expect(revokeRes.status).toBe(204);

    // The original agent's old token is now rejected even though it hasn't expired.
    const after = await agent.get('/api/admin/categories').set('X-CSRF-Token', csrfToken).set('Origin', origin);
    expect(after.status).toBe(401);
  });
});

describe('Session invalidation on account deactivation (code review fix #3)', () => {
  test('deactivate → old session rejected → reactivate → old session still rejected', async () => {
    const agent = request.agent(server);
    const target = await createTestAdmin({ username: 'to-be-deactivated' });
    const { csrfToken: targetCsrf } = await loginAsAdmin(agent, target);

    // A second admin does the deactivating (mirrors how /revoke works —
    // there's no self-service deactivation in this phase).
    const adminAgent = request.agent(server);
    const operator = await createTestAdmin({ username: 'operator' });
    const { csrfToken: operatorCsrf } = await loginAsAdmin(adminAgent, operator);

    // Confirm the target's session works before deactivation.
    const before = await agent.get('/api/admin/categories').set('X-CSRF-Token', targetCsrf).set('Origin', origin);
    expect(before.status).toBe(200);

    const deactivateRes = await adminAgent
      .patch(`/api/admin/users/${target.user._id}/status`)
      .set('X-CSRF-Token', operatorCsrf)
      .set('Origin', origin)
      .send({ status: 'inactive' });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.user.status).toBe('inactive');

    // The old, still-unexpired token is now rejected immediately —
    // tokenVersion was bumped, not just the `status` field.
    const afterDeactivate = await agent
      .get('/api/admin/categories')
      .set('X-CSRF-Token', targetCsrf)
      .set('Origin', origin);
    expect(afterDeactivate.status).toBe(401);

    const reactivateRes = await adminAgent
      .patch(`/api/admin/users/${target.user._id}/status`)
      .set('X-CSRF-Token', operatorCsrf)
      .set('Origin', origin)
      .send({ status: 'active' });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.user.status).toBe('active');

    // The SAME pre-deactivation token must still be rejected after
    // reactivation — reactivation must never roll tokenVersion back down.
    const afterReactivate = await agent
      .get('/api/admin/categories')
      .set('X-CSRF-Token', targetCsrf)
      .set('Origin', origin);
    expect(afterReactivate.status).toBe(401);

    // A fresh login (new token, current tokenVersion) works fine.
    const freshAgent = request.agent(server);
    const { csrfToken: freshCsrf } = await loginAsAdmin(freshAgent, target);
    const freshRes = await freshAgent
      .get('/api/admin/categories')
      .set('X-CSRF-Token', freshCsrf)
      .set('Origin', origin);
    expect(freshRes.status).toBe(200);
  });
});

describe('Logout CSRF protection (code review fix #4)', () => {
  test('a cross-origin-style forged logout request (no CSRF header) is rejected, and the session remains usable', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    // Simulates a cross-origin page submitting a bare <form method="POST">
    // to /api/auth/logout: the browser attaches the session cookie
    // automatically... except SameSite=Strict already blocks that in a
    // real cross-site navigation. This asserts the second, independent
    // layer: even delivered same-origin here, a logout call with no valid
    // CSRF header is rejected outright, exactly like any other
    // state-changing admin request.
    const forgedLogout = await agent.post('/api/auth/logout').set('Origin', origin);
    expect(forgedLogout.status).toBe(403);

    // The session was never touched by the rejected logout attempt.
    const stillLoggedIn = await agent.get('/api/admin/categories').set('X-CSRF-Token', csrfToken).set('Origin', origin);
    expect(stillLoggedIn.status).toBe(200);
  });

  test('a legitimate logout request (matching CSRF cookie/header, valid Origin) succeeds and clears both cookies', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    const res = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrfToken).set('Origin', origin);
    expect(res.status).toBe(204);
    const cookies = (res.headers['set-cookie'] || []).join(';');
    // clearCookie() re-sends the cookie with an immediate expiry.
    expect(cookies).toMatch(/session=;/);
    expect(cookies).toMatch(/csrfToken=;/);
  });
});

describe('Admin account provisioning (architecture doc, section 4)', () => {
  test('there is no public/unauthenticated route to create an admin account', async () => {
    const res = await request(server).post('/api/admin/users').send({ username: 'sneaky', password: 'password123' });
    expect(res.status).toBe(401);
    const stillOnlyZero = await User.countDocuments();
    expect(stillOnlyZero).toBe(0);
  });

  test('any authenticated admin can create another admin account (equal standing, no hierarchy yet)', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    const res = await agent
      .post('/api/admin/users')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ username: 'second-admin', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('second-admin');
    expect(res.body.user.role).toBe('admin');
    const count = await User.countDocuments();
    expect(count).toBe(2);
  });

  test('creating a user with a duplicate username is rejected', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin({ username: 'dupe-test' });
    const { csrfToken } = await loginAsAdmin(agent, admin);

    const res = await agent
      .post('/api/admin/users')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ username: 'dupe-test', password: 'password123' });

    expect(res.status).toBe(409);
  });

  test('creating a user with a short password is rejected by validation', async () => {
    const agent = request.agent(server);
    const admin = await createTestAdmin();
    const { csrfToken } = await loginAsAdmin(agent, admin);

    const res = await agent
      .post('/api/admin/users')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ username: 'shortpw', password: '123' });

    expect(res.status).toBe(400);
  });
});

// Sanity check that the category-creation calls above didn't leak into each
// other via shared state (each test cleans the DB in afterEach).
test('categories collection is empty at the very end if nothing in this file leaked state', async () => {
  const count = await Category.countDocuments();
  expect(count).toBe(0);
});
