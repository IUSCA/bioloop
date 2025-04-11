const express = require('express');
const { body } = require('express-validator');
const config = require('config');
const createError = require('http-errors');
const { Prisma } = require('@prisma/client');

const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { loginHandler } = require('../../middleware/auth');

const authService = require('../../services/auth');
const nonceService = require('../../services/nonce');
const userService = require('../../services/user');
const logger = require('../../services/logger');

const router = express.Router();

function validateSingupToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader) return next(createError.Unauthorized('Signup failed. Token not found.'));

  const err = createError.Unauthorized('Signup failed. Token is not valid.');
  if (!authHeader.startsWith('Bearer ')) { return next(err); }
  const token = authHeader.split(' ')[1];

  const decoded = authService.checkJWT(token);
  if (!decoded) return next(err);

  // validate token scope
  if (decoded.scope !== config.get('auth.signup.jwt.scope')) {
    return next(err);
  }

  if (!decoded.sub || !decoded.nonce) {
    return next(err);
  }

  req._token = { email: decoded.sub, nonce: decoded.nonce };
  next();
}

router.post(
  '/',
  validateSingupToken,
  validate([
    body('username').trim().toLowerCase().isLength({ min: 3, max: 30 })
      .custom(userService.validateUsernameOrThrow),
    body('email').isEmail(),
    body('full_name').trim().isLength({ min: 1, max: 100 }),
    body('institution_name').trim().isLength({ min: 1, max: 100 }),
    body('institution_type').isIn(config.get('institution_types')),
    body('has_agreed_to_terms').isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']

    const signupFailedErr = createError.Unauthorized('Signup failed');
    const { _token } = req; // set in validateSingupToken

    const {
      username, email, full_name, institution_name, institution_type,
    } = req.body;

    const user_data = {
      username,
      email,
      name: full_name,
      metadata: {
        institution_name,
        institution_type,
      },
    };
    // validate if agreed to terms
    if (!req.body.has_agreed_to_terms) {
      logger.error('Signup failed: User did not agree to terms');
      return next(createError.Unauthorized('User did not agree to terms'));
    }

    // validate email in signup token is same as provided email
    if (_token.email !== email) {
      logger.error('Signup failed: Email in token does not match provided email');
      return next(signupFailedErr);
    }

    // validate nonce
    const isConsumed = await nonceService.useNonce(_token.nonce);
    if (!isConsumed) {
      logger.error('Signup failed: Nonce already consumed or invalid');
      return next(signupFailedErr);
    }

    // check if username already exists and return error / generate unique username
    const existingUser = await userService.findUserBy('username', username);
    if (existingUser) {
      if (!config.get('auth.signup.auto_generate_username_if_not_unique')) {
        logger.error('Signup failed: Username already exists');
        // send generic error to avoid account enumeration
        return next(createError.BadRequest('Invalid signup request'));
      }
      try {
        user_data.username = await userService.generateUniqueUsername(username);
      } catch (err) {
        console.error(err);
        logger.error('Signup failed: Unable to generate unique username');
        return next(createError.BadRequest('Invalid signup request'));
      }
    }

    // create user
    const role = config.get('auth.mode') === 'dev'
      ? config.get('auth.signup.dev_default_role')
      : config.get('auth.signup.default_role');
    user_data.roles = [role];
    try {
      const user = await userService.createUser(user_data);
      req.auth = {
        user,
        method: 'SIGNUP',
      };
      next();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // send generic error for constraint violations, and other errors
        // to avoid account enumeration
        console.error(err);
        return next(createError.BadRequest('Invalid signup request'));
      }
      return next(err);
    }
  }),
  loginHandler,
);

module.exports = router;
