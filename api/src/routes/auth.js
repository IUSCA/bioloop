const express = require('express');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper');
const config = require('config');
const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');

const { validate } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { accessControl } = require('../middleware/auth');

const userService = require('../services/user');
const authService = require('../services/auth');

const isPermittedTo = accessControl('auth');
const router = express.Router();
const prisma = new PrismaClient();

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
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
    // eslint-disable-next-line no-unused-vars

    const login = async (cas_id) => {
      const user = await userService.findActiveUserBy('cas_id', cas_id);

      if (user) {
        const resObj = await authService.onLogin({ user });
        return res.json(resObj);
      }
      // User was authenticated with CAS but they are not a portal user
      // Send an empty success message
      return res.status(204).send();
    };

    if (config.mode === 'ci') {
      const test_user = await get_test_user({ role: req.body.ticket });
      await login(test_user.cas_id);
    } else {
      IULogin.validate(req.body.ticket, req.body.service, false, async (err, cas_id) => {
        if (err) return next(err);
        try {
          await login(cas_id);
        } catch (err2) {
          return next(err2);
        }
      });
    }
  }),
);

const get_test_user = async ({ role }) => {
  const test_user_config = config.e2e.users[role];
  const test_user_username = test_user_config.username;

  let test_user = await prisma.user.findUnique({
    where: {
      username: test_user_username,
    },
  });

  if (!test_user) {
    const requested_role = await prisma.role.findFirstOrThrow({
      where: {
        name: role,
      },
    });

    test_user = await prisma.user.create({
      data: {
        username: test_user_username,
        name: test_user_username,
        cas_id: test_user_username,
        email: `${test_user_username}@iu.edu`,
        user_role: {
          create: {
            role_id: requested_role.id,
          },
        },
      },
    });
  }

  return test_user;
};

router.post('/refresh_token', authenticate, asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']
  const user = await userService.findActiveUserBy('username', req.user.username);
  if (user) {
    const resObj = await authService.onLogin({ user });
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
    return res.json(resObj);
  }),
);

module.exports = router;
