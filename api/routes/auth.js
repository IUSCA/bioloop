const express = require('express');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper');
const config = require('config');
const createError = require('http-errors');

const { validate } = require('../middleware/validators');
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
  validate([
    query('service').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
    const loginUrl = IULogin.get_login_url(req.query.service);
    res.json({ url: loginUrl });
  }),
);

router.post(
  '/cas/verify',
  validate([
    body('ticket').notEmpty(),
    body('service').notEmpty(),
  ]),
  (req, res, next) => {
    // #swagger.tags = ['Auth']
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
  },
);

router.post('/refresh_token', authenticate, asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']
  const user = await userService.findActiveUserBy('username', req.user.username);
  if (user) {
    const resObj = await authService.onLogin(user);
    return res.json(resObj);
  }
  // User has a valid token but they are deleted soon after and are not a portal user
  // Send an invalid request error
  return createError.BadRequest('Not a valid user');
}));

if (!['production', 'test'].includes(config.get('mode'))) {
  router.post(
    '/test_login',
    asyncHandler(async (req, res, next) => {
      // #swagger.tags = ['Auth']
      if (req.body?.username === 'test_user') {
        const user = await userService.findActiveUserBy('username', 'test_user');
        const resObj = await authService.onLogin(user);
        return res.json(resObj);
      }
      return next(createError.Forbidden());
    }),
  );
}

module.exports = router;
