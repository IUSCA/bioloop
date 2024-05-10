const express = require('express');
const { query, body } = require('express-validator');
const config = require('config');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');

const userService = require('../../services/user');
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

// possible response codes:
// 200 - return JWT
// 204 - user authenticated but not a portal user
// 500 - error
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
    //   "sub": "100338926102874330519",
    //   "email": "ddeepak6992@gmail.com",
    //   "email_verified": true,
    //   "at_hash": "soIBpOyDtjm3yw9633IB_A",
    //   "iat": 1698353577,
    //   "exp": 1698357177
    // }
    const id_data = utils.decodeJWT(_res.data.id_token);
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
