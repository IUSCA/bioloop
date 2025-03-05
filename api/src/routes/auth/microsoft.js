const crypto = require('node:crypto');
const express = require('express');
const { query, body } = require('express-validator');
const config = require('config');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// const createHttpError = require('http-errors');
const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { loginHandler } = require('../../middleware/auth');

const userService = require('../../services/user');
const utils = require('../../utils');

const router = express.Router();

router.get(
  '/url',
  validate([
    query('redirect_uri').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
    // https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#request-an-authorization-code
    // https://medium.com/@shoaib.alam/part-4-oauth-2-0-pkce-flow-with-azure-ad-cc225c0ed9f6
    const url = new URL(config.get('auth.microsoft.authorization_endpoint'));

    const state = uuidv4();

    /*
    * PKCE code challenge - https://datatracker.ietf.org/doc/html/rfc7636
    * It is RECOMMENDED that the output of a suitable random number generator be used to create a 32-octet sequence.
    *  The octet sequence is then base64url-encoded to produce a 43-octet URL safe string to use as the code verifier.
    *
    * This is not necessary for confidential oauth clients, but microsoft requires it.
    */
    const code_verifier = utils.base64urlEncode(crypto.randomBytes(32));
    const hash = crypto.createHash('sha256').update(code_verifier).digest();
    const code_challenge = utils.base64urlEncode(hash);

    const queryParams = {
      response_type: 'code',
      client_id: config.get('auth.microsoft.client_id'),
      redirect_uri: req.query.redirect_uri,
      response_mode: 'query',
      scope: config.get('auth.microsoft.scope'),
      state,
      code_challenge,
      code_challenge_method: 'S256',
    };

    Object.keys(queryParams).forEach((key) => {
      url.searchParams.set(key, queryParams[key]);
    });

    res.json({ url: url.toString(), state, code_verifier });
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
    body('code_verifier').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
    // exchange code to get id token
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', config.get('auth.microsoft.client_id'));
    params.append('client_secret', config.get('auth.microsoft.client_secret'));
    params.append('redirect_uri', req.body.redirect_uri);
    params.append('code', req.body.code);
    params.append('scope', config.get('auth.microsoft.scope'));
    params.append('code_verifier', req.body.code_verifier);
    const _res = await axios.post(config.get('auth.microsoft.token_endpoint'), params);
    // console.log(JSON.stringify(_res.data, null, 2));
    // return next(createHttpError.InternalServerError('Unable to verify Microsoft token'));
    // res.data looks like this
    // {
    //   "token_type": "Bearer",
    //   "scope": "https://graph.microsoft.com/User.Read",
    //   "expires_in": 3600,
    //   "ext_expires_in": 3600,
    //   "access_token": "<token>"
    // }

    const msft_res = await axios.get(
      'https://graph.microsoft.com/v1.0/me',
      {
        headers: {
          Authorization: `Bearer ${_res.data.access_token}`,
        },
      },
    );
    const msft_user = msft_res.data;
    // console.log(JSON.stringify(msft_user, null, 2));
    // msft_user looks like this
    // {
    //   "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users/$entity",
    //   "userPrincipalName": "fakeuser@example.com",
    //   "id": "1234567890abcdef",
    //   "displayName": "John Doe",
    //   "surname": "Doe",
    //   "givenName": "John",
    //   "preferredLanguage": "en-US",
    //   "mail": "fakeuser@example.com",
    //   "mobilePhone": null,
    //   "jobTitle": null,
    //   "officeLocation": null,
    //   "businessPhones": []
    // }

    const email = msft_user.mail || msft_user.userPrincipalName;
    const user = await userService.findActiveUserBy('email', email);
    req.auth_user = user;
    req.auth_method = 'microsoft';
    next();
  }),
  loginHandler,
);
module.exports = router;
