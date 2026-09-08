const express = require('express');
const config = require('config');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { isFeatureEnabled } = require('@/services/features');
const { authenticate } = require('@/middleware/auth');
const { accessControl } = require('@/middleware/auth');
const userService = require('@/services/user');
const authService = require('@/services/auth');
const constants = require('@/constants');

const isPermittedTo = accessControl('auth');
const router = express.Router();

const googleRouter = require('./google');
const cilogonRouter = require('./cilogon');
const casRouter = require('./iucas');
const microsoftRouter = require('./microsoft');
const signupRouter = require('./signup');

router.post('/logout', authenticate, asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']

  // nothing to do on the backend for logout since we are using JWTs, but we can clear the cookie here just in case
  res.clearCookie(constants.JWT_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  });
  res.clearCookie(constants.GRAFANA_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  });
  return res.json({ message: 'Logged out successfully' });
}));

router.post('/refresh_token', authenticate, asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']
  const user = await userService.findActiveUserBy('username', req.user.username);
  if (user) {
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
  }
  // User has a valid token but they are deleted soon after and are not a portal user
  // Send an invalid request error
  return createError.BadRequest('Not a valid user');
}));

// Development login. Signs in as any active user by username, with no credential of any
// kind, so that a developer or an agent driving a browser can exercise a platform admin, a
// group admin, and an ordinary member in turn without CAS.
//
// The route is not registered at all when env is production or test, which is the whole of
// its safety. Do not add a credential check and relax that guard: the guard is what makes
// the absence of a credential acceptable.
//
// @see docs/guides/dev-servers.md — Logging in without CAS
if (!['production', 'test'].includes(config.get('env'))) {
  router.post(
    '/test_login',
    asyncHandler(async (req, res, next) => {
      // #swagger.tags = ['Auth']
      const { username } = req.body || {};
      if (!username) {
        return next(createError.BadRequest('username is required'));
      }

      const user = await userService.findActiveUserBy('username', username);
      if (!user) {
        return next(createError.NotFound(`No active user named '${username}'`));
      }

      const resObj = await authService.onLogin({ user, method: 'test_login' });
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

if (isFeatureEnabled({ key: 'signup' })) {
  router.use('/signup', signupRouter);
}
module.exports = router;
