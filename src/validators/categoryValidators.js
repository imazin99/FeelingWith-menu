const { body, param } = require('express-validator');
const mongoose = require('mongoose');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const createCategoryRules = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('name must be 2-50 characters.'),
  body('displayOrder').optional().isInt({ min: 0 }).withMessage('displayOrder must be >= 0.'),
];

const updateCategoryRules = [
  param('id').custom(isObjectId).withMessage('Invalid category id.'),
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('name must be 2-50 characters.'),
  body('displayOrder').optional().isInt({ min: 0 }).withMessage('displayOrder must be >= 0.'),
];

const idParamRule = [param('id').custom(isObjectId).withMessage('Invalid category id.')];

module.exports = { createCategoryRules, updateCategoryRules, idParamRule };
