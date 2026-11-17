const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');

const SESSION_COOKIE = 'session';

// Architecture doc, section 4: JWT issued on login, sent as an HttpOnly,
// Secure, SameSite=Strict cookie. tokenVersion is checked on every request
// so incrementing it instantly invalidates every outstanding token for that
// account, without a server-side session store or denylist.
function signSessionToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), tokenVersion: user.tokenVersion },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours, matches JWT_EXPIRES_IN default
    path: '/',
  };
}

// Mounted on the whole /api/admin router (never route-by-route), so no
// admin route is reachable by omission (architecture doc, section 4).
const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) {
    throw ApiError.unauthorized('Authentication required.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired session.');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    throw ApiError.unauthorized('Invalid session.');
  }

  // A mismatch means the token was issued before the account's tokenVersion
  // was bumped (password change, forced logout) — treat as revoked.
  if (user.tokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized('Session has been revoked.');
  }

  req.user = user;
  next();
});

module.exports = {
  SESSION_COOKIE,
  signSessionToken,
  sessionCookieOptions,
  requireAuth,
};
