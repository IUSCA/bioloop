const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper');
const config = require('config');
const createError = require('http-errors');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

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
  (req, res, next) => {
    // #swagger.tags = ['Auth']
    // eslint-disable-next-line no-unused-vars
    IULogin.validate(req.body.ticket, req.body.service, false, async (err, cas_id, profile) => {
      if (err) return next(err);
      try {
        const user = await userService.findActiveUserBy('cas_id', cas_id);
        if (user) {
          const resObj = await authService.onLogin({ user });
          return res.json(resObj);
        }
        // User was authenticated with CAS but they are not a portal user
        // Send an empty success message
        return res.status(204).send();
      } catch (err2) {
        return next(err2);
      }
    });
  },
);

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

router.get(
  '/google/url',
  validate([
    query('redirect_uri').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']
    const url = new URL(config.get('auth.google.authorization_endpoint'));

    // https://developers.google.com/identity/openid-connect/openid-connect#state-param
    const state = uuidv4();
    // store state in database - verify request may go to another instance in cluster mode
    await prisma.auth_state.create({
      data: {
        state,
        provider: 'google',
      },
    });

    const queryParams = {
      response_type: 'code',
      client_id: config.get('auth.google.client_id'),
      redirect_uri: req.query.redirect_uri,
      scope: config.get('auth.google.scope'),
      state,
    };

    Object.keys(queryParams).forEach((key) => {
      url.searchParams.set(key, queryParams[key]);
    });

    res.json({ url: url.toString() });
  }),
);

function decodeJWT(token) {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64').toString());
}

// possible response codes:
// 200 - return JWT
// 204 - user authenticated but not a portal user
// 500 - error
router.post(
  '/google/verify',
  validate([
    body('code').notEmpty(),
    body('state').notEmpty(),
    body('redirect_uri').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']

    // check if state is valid
    const state = await prisma.auth_state.findUnique({
      where: {
        state: req.body.state,
      },
    });
    if (!state) {
      return next(createError.BadRequest('Invalid state'));
    }
    // delete state from database
    await prisma.auth_state.delete({
      where: {
        state: req.body.state,
      },
    });

    // exchange code to get id token
    const _res = await axios.post(
      config.get('auth.google.token_endpoint'),
      {
        code: req.body.code,
        client_id: config.get('auth.google.client_id'),
        client_secret: config.get('auth.google.client_secret'),
        redirect_uri: req.body.redirect_uri,
        grant_type: 'authorization_code',
      },
    );
    // decoded id_token looks like this:
    // {
    //   "iss": "accounts.google.com",
    //   "sub": "100338926102874330519",
    //   "email": "ddeepak6992@gmail.com",
    //   "email_verified": true,
    //   "at_hash": "soIBpOyDtjm3yw9633IB_A",
    //   "iat": 1698353577,
    //   "exp": 1698357177
    // }
    const id_data = decodeJWT(_res.data.id_token);
    const { email } = id_data;

    const user = await userService.findActiveUserBy('email', email);
    if (user) {
      const resObj = await authService.onLogin({ user, method: 'Google' });
      return res.json(resObj);
    }
    // User was authenticated with google but they are not a portal user
    // Send an empty success message
    return res.status(204).send();
  }),
);
module.exports = router;
