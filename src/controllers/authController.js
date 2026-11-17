const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { signSessionToken, sessionCookieOptions, SESSION_COOKIE } = require('../middleware/auth');
const { generateCsrfToken, csrfCookieOptions, CSRF_COOKIE } = require('../middleware/csrf');

// POST /api/auth/login
// Public (no auth required to reach it — it's how auth begins), but rate
// limited (see routes/authRoutes.js) against brute-force guessing.
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw ApiError.badRequest('Username and password are required.');
  }

  const user = await User.findOne({ username: username.toLowerCase().trim() }).select(
    '+passwordHash'
  );

  // Same response whether the user doesn't exist or the password is wrong —
  // never reveal which one failed.
  if (!user || user.status !== 'active') {
    throw ApiError.unauthorized('Invalid username or password.');
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw ApiError.unauthorized('Invalid username or password.');
  }

  const token = signSessionToken(user);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.cookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions());

  res.json({
    user: {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
  });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.status(204).end();
});

// GET /api/auth/me — requires auth; lets the dashboard confirm who's logged in.
const me = asyncHandler(async (req, res) => {
  const { _id, username, fullName, role, status } = req.user;
  res.json({ user: { id: _id, username, fullName, role, status } });
});

module.exports = { login, logout, me };
