const fs = require('fs');
const path = require('path');

const jsonwt = require('jsonwebtoken');
const _ = require('lodash/fp');
const config = require('config');
const { OAuth2Client } = require('@badgateway/oauth2-client');

const logger = require('./logger');
const userService = require('./user');

const key = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.key')));
const pub = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.pub')));
const signOpt = {
  algorithm: config.get('auth.jwt.sign_algorithm'),
};

function issueJWT({ userProfile, forever = false }) {
  const claim = {
    iss: config.get('auth.jwt.iss'),
    ...(forever ? {} : { exp: (Date.now() + config.get('auth.jwt.ttl_milliseconds')) / 1000 }),
    sub: userProfile.username,
    profile: userProfile,
  };
  return jsonwt.sign(claim, key, signOpt);
}

const get_user_profile = _.pick(['username', 'email', 'name', 'roles', 'cas_id', 'id']);

async function onLogin({ user, updateLastLogin = true }) {
  if (updateLastLogin) { await userService.updateLastLogin({ id: user.id, method: 'IUCAS' }); }

  const userProfile = get_user_profile(user);

  const token = issueJWT({ userProfile });
  return {
    profile: userProfile,
    token,
  };
}

function checkJWT(token) {
  try {
    const decoded = jsonwt.verify(token, pub);
    return decoded;
  } catch (err) {
    logger.error('Failed to verify JWT', err);
    return null;
  }
}

const oAuth2DownloadClient = new OAuth2Client({
  // The base URI of your OAuth2 server
  server: config.get('oauth.base_url'),
  // OAuth2 client id
  clientId: config.get('oauth.download.client_id'),
  clientSecret: config.get('oauth.download.client_secret'),
  tokenEndpoint: 'oauth/token',
});

const oAuth2UploadClient = new OAuth2Client({
  // The base URI of your OAuth2 server
  server: config.get('oauth.base_url'),
  // OAuth2 client id
  clientId: config.get('oauth.upload.client_id'),
  clientSecret: config.get('oauth.upload.client_secret'),
  tokenEndpoint: 'oauth/token',
});

function get_download_token(file_path) {
  return oAuth2DownloadClient.clientCredentials({
    scope: [`${config.get('oauth.download.scope_prefix')}${file_path}`],
  });
}

function get_upload_token() {
  console.log(`upload scope: ${config.get('oauth.upload.scope')}`)
  return oAuth2UploadClient.clientCredentials({
    // scope: [`${config.get('oauth.upload.scope')}`],
    scope: ["upload_file"]
  });
}

module.exports = {
  onLogin,
  issueJWT,
  checkJWT,
  get_user_profile,
  get_download_token,
  get_upload_token,
};
