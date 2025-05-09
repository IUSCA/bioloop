const express = require('express');
const { query, body } = require('express-validator');
const config = require('config');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const createError = require('http-errors');
const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { loginHandler } = require('../../middleware/auth');
const logger = require('../../services/logger');

const authService = require('../../services/auth');
const utils = require('../../utils');

const router = express.Router();

router.get(
  '/url',
  validate([
    query('redirect_uri').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Auth']
    const url = new URL(config.get('auth.google.authorization_endpoint'));

    // https://developers.google.com/identity/openid-connect/openid-connect#state-param
    const state = uuidv4();

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

    res.json({ url: url.toString(), state });
  }),
);

router.post(
  '/verify',
  validate([
    body('code').notEmpty(),
    body('redirect_uri').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
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
    //   "sub": "1132891511",
    //   "email": "user@gmail.com",
    //   "email_verified": true,
    //   "at_hash": "<hash>",
    //   "iat": 1698353577,
    //   "exp": 1698357177
    // }
    const id_data = utils.decodeJWT(_res.data.id_token);
    const { email } = id_data;

    if (!email) {
      logger.error('Failed to get email from Google token');
      return next(createError.InternalServerError());
    }
    const user = await authService.getLoginUser('email', email);
    req.auth = {
      user,
      method: 'google',
      identity: {
        email,
      },
    };
    next();
  }),
  loginHandler,
);
module.exports = router;
