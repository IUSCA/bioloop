const express = require('express');
const config = require('config');
const createError = require('http-errors');

const asyncHandler = require('../../middleware/asyncHandler');
const { authenticate } = require('../../middleware/auth');
const { accessControl } = require('../../middleware/auth');

const userService = require('../../services/user');
const authService = require('../../services/auth');

const isPermittedTo = accessControl('auth');
const router = express.Router();

const googleRouter = require('./google');
const cilogonRouter = require('./cilogon');
const casRouter = require('./iucas');
const microsoftRouter = require('./microsoft');
const signupRouter = require('./signup');

router.post('/refresh_token', authenticate, asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']
  const user = await userService.findActiveUserBy('username', req.user.username);
  if (user) {
    const resObj = await authService.onLogin({ user });
    if (user.roles.includes('admin')) {
      // set cookie
      res.cookie('grafana_token', authService.issueGrafanaToken(user), {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });
    } else {
      // if user is not an admin, clear the cookie
      res.clearCookie('grafana_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });
    }
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
        const resObj = await authService.onLogin({ user });
        if (user.roles.includes('admin')) {
          // set cookie
          res.cookie('grafana_token', authService.issueGrafanaToken(user), {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
          });
        } else {
          // if user is not an admin, clear the cookie
          res.clearCookie('grafana_token', {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
          });
        }
        return res.json(resObj);
      }
      return next(createError.Forbidden());
    }),
  );
}

router.post(
  '/spoof/:username',
  authenticate,
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']
    const user = await userService.findActiveUserBy('username', req.params.username);
    const resObj = await authService.onLogin({ user, updateLastLogin: false });
    if (user.roles.includes('admin')) {
      // set cookie
      res.cookie('grafana_token', authService.issueGrafanaToken(user), {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });
    } else {
      // if user is not an admin, clear the cookie
      res.clearCookie('grafana_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });
    }
    return res.json(resObj);
  }),
);

router.use('/cas', casRouter);

if (config.get('auth.google.enabled')) {
  router.use('/google', googleRouter);
}

if (config.get('auth.cilogon.enabled')) {
  router.use('/cilogon', cilogonRouter);
}

if (config.get('auth.microsoft.enabled')) {
  router.use('/microsoft', microsoftRouter);
}

if (config.get('auth.signup.enabled')) {
  router.use('/signup', signupRouter);
}
module.exports = router;
