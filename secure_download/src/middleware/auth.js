const createError = require('http-errors');
const jsonwt = require('jsonwebtoken');

const authService = require('../services/auth');

function authenticate(req, res, next) {
  const invalid_token_err = createError.Unauthorized('Authentication failed. Token is not valid.');

  let token = req.query?.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next(createError.Unauthorized('Authentication failed. Token not found.'));
    if (!authHeader.startsWith('Bearer ')) { return next(invalid_token_err); }
    // eslint-disable-next-line prefer-destructuring
    token = authHeader.split(' ')[1];
  }

  authService.checkJWT(token).then((decoded_token) => {
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
