const express = require('express');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper');
const config = require('config');
const createError = require('http-errors');

const validator = require('../middleware/validator');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');
const userService = require('../services/user');
const authService = require('../services/auth');

const router = express.Router();

const IULogin = new IULoginHelper({
  protocol: 'CAS',
  mode: config.get('auth.mode'),
});

router.get(
  '/cas/url',
  query('service').notEmpty(),
  validator(async (req, res, next) => {
    const loginUrl = IULogin.get_login_url(req.query.service);
    res.json({ url: loginUrl });
  }),
);

router.post(
  '/cas/verify',
  body('ticket').notEmpty(),
  body('service').notEmpty(),
  validator(async (req, res, next) => {
    // eslint-disable-next-line no-unused-vars
    IULogin.validate(req.body.ticket, req.body.service, false, async (err, cas_id, profile) => {
      if (err) return next(err);
      const user = await userService.findActiveUserBy('cas_id', cas_id);
      if (user) {
        const resObj = await authService.onLogin(user);
        return res.json(resObj);
      }
      // User was authenticated with CAS but they are not a portal user
      // Send an empty success message
      return res.status(204).send();
    });
  }),
);

router.post('/refresh_token', authenticate, asyncHandler(async (req, res, next) => {
  const user = await userService.findActiveUserBy('username', req.user.username);
  if (user) {
    const resObj = await authService.onLogin(user);
    return res.json(resObj);
  }
  // User has a valid token but they are deleted soon after and are not a portal user
  // Send an invalid request error
  return createError.BadRequest('Not a valid user');
}));

module.exports = router;
