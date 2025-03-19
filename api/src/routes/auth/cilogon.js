/* eslint-disable no-console */
const express = require('express');
const { query, body } = require('express-validator');
const config = require('config');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { loginHandler } = require('../../middleware/auth');

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
    const url = new URL(config.get('auth.cilogon.authorization_endpoint'));

    // https://developers.google.com/identity/openid-connect/openid-connect#state-param
    const state = uuidv4();

    const queryParams = {
      response_type: 'code',
      client_id: config.get('auth.cilogon.client_id'),
      redirect_uri: req.query.redirect_uri,
      scope: config.get('auth.cilogon.scope'),
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
    // POST with application/x-www-form-urlencoded data
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', config.get('auth.cilogon.client_id'));
    params.append('client_secret', config.get('auth.cilogon.client_secret'));
    params.append('redirect_uri', req.body.redirect_uri);
    params.append('code', req.body.code);
    const _res = await axios.post(config.get('auth.cilogon.token_endpoint'), params);
    // decoded id_token looks like this:
    // {
    //   iss: 'https://cilogon.org',
    //   aud: 'cilogon:/client_id/',
    //   exp: 1698419542,
    //   iat: 1698418642,
    //   jti: 'https://cilogon.org/oauth2/idToken/',
    //   auth_time: 1698418641,
    //   azp: 'cilogon:/client_id/',
    //   sub: 'http://cilogon.org/serverE/users/',
    // acr:
    // 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
    // email: 'deduggi@iu.edu' }
    console.log(JSON.stringify(_res.data, null, 2));
    const id_data = utils.decodeJWT(_res.data.id_token);
    const { email } = id_data;
    console.log('email', email);

    if (!email) {
      return res.status(500).json({ message: 'Failed to get email from auth provider' });
    }
    const user = await authService.getLoginUser('email', email);
    console.log(JSON.stringify(user, null, 2));
    req.auth_user = user;
    req.auth_method = 'CILogon';
    next();
  }),
  loginHandler,
);

module.exports = router;
