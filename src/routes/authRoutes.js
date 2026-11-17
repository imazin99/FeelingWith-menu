const express = require('express');
const { login, logout, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const { loginRateLimiter } = require('../middleware/rateLimit');
const { loginRules } = require('../validators/userValidators');
const validate = require('../middleware/validate');

const router = express.Router();

// Public (this is how a session begins) but rate-limited against
// brute-forcing credentials (brand spec, section 9).
router.post('/login', loginRateLimiter, loginRules, validate, login);

// Code review fix #4: logout is a state-changing request (it ends the
// caller's session) and was previously reachable with no CSRF protection
// at all — a cross-origin page could silently POST to it (e.g. via a
// simple <form> submit, which needs no CORS permission) and force a logged-
// in admin to be logged out. requireCsrf now guards it exactly like every
// other state-changing admin request: Origin validation plus the
// double-submit cookie/header check. A caller with no session (and
// therefore no csrfToken cookie) simply gets a 403 instead of a 204 — there
// is nothing meaningful to log out of in that case anyway.
router.post('/logout', requireCsrf, logout);
router.get('/me', requireAuth, me);

module.exports = router;
