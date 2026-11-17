const { body, param } = require('express-validator');
const mongoose = require('mongoose');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const createAddOnRules = [
  body('name').trim().isLength({ min: 1, max: 30 }).withMessage('name must be 1-30 characters.'),
  body('price').isFloat({ min: 0 }).withMessage('price must be >= 0.'),
];

const updateAddOnRules = [
  param('id').custom(isObjectId).withMessage('Invalid add-on id.'),
  body('name').optional().trim().isLength({ min: 1, max: 30 }).withMessage('name must be 1-30 characters.'),
  body('price').optional().isFloat({ min: 0 }).withMessage('price must be >= 0.'),
];

const idParamRule = [param('id').custom(isObjectId).withMessage('Invalid add-on id.')];

module.exports = { createAddOnRules, updateAddOnRules, idParamRule };
