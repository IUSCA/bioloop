// express-validators functions such as body, query, param are used to validate requests
// when the request is invalid send 400 error to client before processing further
// this also acts as asyncHandler (see asyncHandler.js)

const { validationResult } = require('express-validator');

const validator = (fn) => (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = validator;
