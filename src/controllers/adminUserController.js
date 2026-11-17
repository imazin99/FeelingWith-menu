const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const BCRYPT_COST = 11;

// GET /api/admin/users — any authenticated admin can list accounts
// (architecture doc, section 4: equal standing, no hierarchy in this phase).
const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  res.json({ users });
});

// POST /api/admin/users — any authenticated admin can create another.
// There is no public/unauthenticated route that does this (section 4) —
// this route sits behind requireAuth + requireCsrf like every other
// /api/admin/* write.
const createUser = asyncHandler(async (req, res) => {
  const { username, password, fullName } = req.body;
  if (!username || !password) {
    throw ApiError.badRequest('username and password are required.');
  }
  if (password.length < 8) {
    throw ApiError.badRequest('password must be at least 8 characters.');
  }

  const normalizedUsername = username.toLowerCase().trim();
  const existing = await User.findOne({ username: normalizedUsername });
  if (existing) {
    throw ApiError.conflict('That username is already taken.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await User.create({
    username: normalizedUsername,
    passwordHash,
    fullName,
  });

  res.status(201).json({
    user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role, status: user.status },
  });
});

// PATCH /api/admin/users/:id/status — { status: 'active' | 'inactive' }
//
// Code review fix #3: deactivating an account must take effect immediately,
// not merely at next token expiry (up to 8h away). Setting status:
// 'inactive' alone doesn't do that — requireAuth's tokenVersion check is
// what actually revokes an outstanding JWT, so deactivation now also bumps
// tokenVersion, exactly like POST /:id/revoke does.
//
// Reactivating the account (status: 'active') deliberately never resets or
// decrements tokenVersion. tokenVersion only ever increases for this user
// document: a session token issued before the account was deactivated
// carries the pre-deactivation tokenVersion as a claim baked into the
// (already-signed) JWT, and since that claim can never match the account's
// current, now-higher tokenVersion again, that old token can never become
// valid again — even after the account is reactivated. A reactivated admin
// simply has to log in again and receive a fresh token.
const setStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) {
    throw ApiError.badRequest("status must be 'active' or 'inactive'.");
  }

  const update = { $set: { status } };
  if (status === 'inactive') {
    update.$inc = { tokenVersion: 1 };
  }

  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!user) throw ApiError.notFound('User not found.');
  res.json({
    user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role, status: user.status },
  });
});

// POST /api/admin/users/:id/revoke — bumps tokenVersion to invalidate every
// outstanding session for that account immediately (section 4).
const revokeSessions = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $inc: { tokenVersion: 1 } },
    { new: true }
  );
  if (!user) throw ApiError.notFound('User not found.');
  res.status(204).end();
});

module.exports = { listUsers, createUser, setStatus, revokeSessions };
