const createError = require('http-errors');
const jsonwt = require('jsonwebtoken');

const authService = require('../services/auth');

function authenticate(req, res, next) {
  console.log('validating token ...');

  let token = req.query?.token;
  // console.log('token', token);

  if (!token) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next(createError.Unauthorized('Authentication failed. Token not found.'));
    if (!authHeader.startsWith('Bearer ')) { return next(invalid_token_err); }
    // eslint-disable-next-line prefer-destructuring
    token = authHeader.split(' ')[1];
    // console.log('token from header', token);
  }

  authService.checkJWT(token).then((decoded_token) => {
    if (!decoded_token) {
      console.log('could not decode token');
      return next(invalid_token_err)
    };
    req.token = decoded_token;
    console.log('token validated');
    next();
  }).catch((e) => {
    console.log('jwt verification error', e);
    if (e instanceof jsonwt.TokenExpiredError) {
      return next(createError.Unauthorized('Authentication failed. Token expired.'));
    }
    console.log('caught error, but error not instance of TokenExpiredError')
    next(e);
  });
}

module.exports = {
  authenticate,
};
