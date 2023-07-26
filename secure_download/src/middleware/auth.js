const createError = require('http-errors');
const jsonwt = require('jsonwebtoken');

const authService = require('../services/auth');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader) return next(createError.Unauthorized('Authentication failed. Token not found.'));

  const invalid_token_err = createError.Unauthorized('Authentication failed. Token is not valid.');
  if (!authHeader.startsWith('Bearer ')) { return next(invalid_token_err); }
  const bearer_token = authHeader.split(' ')[1];

  authService.checkJWT(bearer_token).then((decoded_token) => {
    if (!decoded_token) return next(invalid_token_err);
    req.token = decoded_token;
    next();
  }).catch((e) => {
    if (e instanceof jsonwt.TokenExpiredError) {
      return next(createError.Unauthorized('Authentication failed. Token expired.'));
    }
    next(e);
  });
}

module.exports = {
  authenticate,
};
