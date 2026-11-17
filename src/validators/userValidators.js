const { body } = require('express-validator');

const createUserRules = [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('username must be 3-30 characters.'),
  body('password').isLength({ min: 8 }).withMessage('password must be at least 8 characters.'),
  body('fullName').optional().trim().isLength({ max: 100 }),
];

const loginRules = [
  body('username').trim().notEmpty().withMessage('username is required.'),
  body('password').notEmpty().withMessage('password is required.'),
];

module.exports = { createUserRules, loginRules };
