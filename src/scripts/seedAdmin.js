#!/usr/bin/env node
// Architecture doc, section 4: the first admin account is created by a
// one-time seed step run directly against the database at deployment time —
// never through a public HTTP endpoint. No route anywhere accepts an
// unauthenticated "create the first admin" request; this script is the only
// way to create an account with zero existing admins.
//
// Usage:
//   SEED_ADMIN_USERNAME=owner SEED_ADMIN_PASSWORD=change-me node src/scripts/seedAdmin.js
// or interactively:
//   node src/scripts/seedAdmin.js

const readline = require('readline');
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');

const BCRYPT_COST = 11;

function prompt(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      // Minimal masking for interactive password entry; not a full TTY
      // password-mask implementation, but avoids echoing the password back.
      rl._writeToOutput = (str) => {
        if (str.includes('\n')) rl.output.write('\n');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  await connectDB();

  const existingCount = await User.countDocuments();
  if (existingCount > 0) {
    console.log(`There ${existingCount === 1 ? 'is' : 'are'} already ${existingCount} admin account(s). ` +
      'This script only seeds the very first account. Use the dashboard (POST /api/admin/users, ' +
      'as an authenticated admin) to create additional ones.');
    await disconnectDB();
    process.exit(1);
  }

  const username =
    process.env.SEED_ADMIN_USERNAME || (await prompt('First admin username: '));
  const password =
    process.env.SEED_ADMIN_PASSWORD || (await prompt('First admin password (min 8 chars): ', { hidden: true }));

  if (!username || username.length < 3) {
    console.error('Username must be at least 3 characters.');
    await disconnectDB();
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    await disconnectDB();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await User.create({
    username: username.toLowerCase().trim(),
    passwordHash,
    role: 'admin',
    status: 'active',
  });

  console.log(`Created first admin account: ${user.username} (id ${user._id})`);
  await disconnectDB();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
