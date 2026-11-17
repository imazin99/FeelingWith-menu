const request = require('supertest');
const { createApp, connectTestDb, disconnectTestDb, clearCollections, createTestAdmin, listen, closeServer } = require('../helpers/testApp');
const { loginAsAdmin } = require('../helpers/authHelper');
const Settings = require('../../src/models/Settings');

let app;
let server;
let origin;
let agent;
let csrfToken;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  ({ server, origin } = await listen(app));
});

beforeEach(async () => {
  agent = request.agent(server);
  const admin = await createTestAdmin();
  ({ csrfToken } = await loginAsAdmin(agent, admin));
});

afterEach(async () => {
  await clearCollections();
});

afterAll(async () => {
  await disconnectTestDb();
  await closeServer(server);
});

describe('Admin Settings (singleton, editable-now vs. deferred fields)', () => {
  test('GET returns the singleton settings document, creating it on first access', async () => {
    const res = await agent.get('/api/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.cafeName).toBe('Feeling With');
    expect(res.body.settings._id).toBe('singleton');
  });

  test('PATCH updates confirmed editable-now fields (café name, tagline, contact, social, language)', async () => {
    const res = await agent
      .patch('/api/admin/settings')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({
        cafeName: 'Feeling With Café',
        tagline: 'Warm cups, warmer moments',
        contact: { phone: '+20 100 000 0000', email: 'hello@feelingwith.com' },
        socialLinks: { instagram: 'https://instagram.com/soltr_wear' },
        language: 'en',
        isRtl: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.settings.cafeName).toBe('Feeling With Café');
    expect(res.body.settings.tagline).toBe('Warm cups, warmer moments');
    expect(res.body.settings.contact.phone).toBe('+20 100 000 0000');
  });

  test('PATCH silently ignores fields that are not on the editable-now list (no deferred fields exist to accept)', async () => {
    const res = await agent
      .patch('/api/admin/settings')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({
        cafeName: 'Feeling With',
        displayConfig: { density: 'compact' }, // deferred — architecture doc, section 7
      });

    expect(res.status).toBe(200);
    expect(res.body.settings.displayConfig).toBeUndefined();
  });

  test('PATCH with only unrecognized fields is rejected (nothing to update)', async () => {
    const res = await agent
      .patch('/api/admin/settings')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ displayConfig: { density: 'compact' } });
    expect(res.status).toBe(400);
  });

  test('the Settings document persists as a single document regardless of repeated PATCHes', async () => {
    // Round 6 review fix: this previously sent `cafeName: 'A'` / `'B'` —
    // single-character values that violate the schema's own
    // `minlength: 2` on cafeName (src/models/Settings.js). Both PATCHes
    // were therefore rejected by runValidators with a 400, no document
    // was ever created, and the final count came back 0 — not a
    // persistence bug, an invalid test fixture. Neither PATCH's status
    // was being checked here, which is why that went unnoticed; both are
    // checked now, and valid (>= 2 character) names are used so the test
    // actually exercises what it claims to.
    const first = await agent.patch('/api/admin/settings').set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ cafeName: 'AA' });
    expect(first.status).toBe(200);
    const second = await agent.patch('/api/admin/settings').set('X-CSRF-Token', csrfToken).set('Origin', origin).send({ cafeName: 'BB' });
    expect(second.status).toBe(200);

    const count = await Settings.countDocuments();
    expect(count).toBe(1);
  });

  test('language accepts only "en" or "ar" (schema enum)', async () => {
    const res = await agent
      .patch('/api/admin/settings')
      .set('X-CSRF-Token', csrfToken).set('Origin', origin)
      .send({ language: 'fr' });
    expect(res.status).toBe(400);
  });
});
