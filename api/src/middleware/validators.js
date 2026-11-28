const { validationResult } = require('express-validator');

// const validator = (fn) => (req, res, next) => {
//   // express-validators functions such as body, query, param are used to validate requests
//   // when the request is invalid send 400 error to client before processing further
//   // this also acts as asyncHandler (see asyncHandler.js)
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   }
//   return Promise.resolve(fn(req, res, next)).catch(next);
// };

const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

function parseSortString(value) {
  // https://specs.openstack.org/openstack/api-wg/guidelines/pagination_filter_sort.html
  try {
    const pairs = value.split(',');
    if (pairs.length === 0) return {};
    return pairs.map((pair) => {
      const [key, _dir] = pair.split(':');
      const dir = _dir || 'asc';
      if (key && (dir === 'asc' || dir === 'desc')) {
        return { key, dir };
      }
      throw new Error('Invalid sort query');
    });
  } catch (err) {
    // console.log('sort error', err);
    throw new Error('Invalid sort query');
  }
}

const validateSort = (value) => {
  parseSortString(value); // if no error, return true
  return true;
};

const sanitizeSort = (value) => parseSortString(value);

const addSortSanitizer = (validationChain) => validationChain
  .custom(validateSort)
  .bail()
  .customSanitizer(sanitizeSort);

module.exports = {
  validate,
  addSortSanitizer,
};
