const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Runs after an array of express-validator checks; turns their result into
// the same ApiError/error-handler shape as everything else (section 3).
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = {};
  for (const e of result.array()) {
    details[e.path] = e.msg;
  }
  next(ApiError.badRequest('Validation failed.', details));
}

module.exports = validate;
