const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const jsonwt = require('jsonwebtoken');
const _ = require('lodash/fp');
const config = require('config');
const { OAuth2Client } = require('@badgateway/oauth2-client');
const { PrismaClient } = require('@prisma/client');

const logger = require('./logger');
const userService = require('./user');

const prisma = new PrismaClient();

const key = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.key')));
const pub = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.pub')));
const signOpt = {
  algorithm: config.get('auth.jwt.sign_algorithm'),
};

function issueJWT({ userProfile, forever = false, aud }) {
  const claim = {
    iss: config.get('auth.jwt.iss'),
    ...(forever ? {} : { exp: (Date.now() + config.get('auth.jwt.ttl_milliseconds')) / 1000 }),
    sub: userProfile.username,
    profile: userProfile,
    ...(aud ? { aud } : {}),
  };
  return jsonwt.sign(claim, key, signOpt);
}

const get_user_profile = _.pick(['username', 'email', 'name', 'roles', 'cas_id', 'id']);

async function onLogin({ user, method, updateLastLogin = true }) {
  if (updateLastLogin) {
    await userService.updateLastLogin({ id: user.id, method });
  }

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

const oAuth2SecureTransferClient = new OAuth2Client({
  // The base URI of your OAuth2 server
  server: config.get('oauth.base_url'),
  // OAuth2 client id
  clientId: config.get('oauth.download.client_id'),
  clientSecret: config.get('oauth.download.client_secret'),
  tokenEndpoint: 'oauth/token',
});

function get_download_token(file_path) {
  return oAuth2SecureTransferClient.clientCredentials({
    scope: [`${config.get('oauth.download.scope_prefix')}${file_path}`],
  });
}

const find_or_create_test_user = async ({ role }) => {
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

function get_upload_token(file_path) {
  // [^\w.-]+ matches one or more characters that are not word
  // characters (letters, digits, or underscore), dots, or hyphens
  const hyphen_delimited_file_path = file_path.replace(/[^\w.-]+/g, '-');
  const scope = `${config.get('oauth.upload.scope_prefix')}${hyphen_delimited_file_path}`;
  return oAuth2SecureTransferClient.clientCredentials({
    scope: [scope],
  });
}

// Function to load and convert the public key to JWKS
function getJWKS() {
  // Parse the public key.  This will throw an error if the key is invalid.
  const publicKey = crypto.createPublicKey(pub);

  const keyExp = publicKey.export({ format: 'jwk' });

  // Get the key's thumbprint (SHA-256). This is a common way to identify a
  // key.
  const thumbprint = crypto
    .createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');

  //  Create a JWKS key object
  const jwks = {
    keys: [{
      kty: 'RSA',
      kid: thumbprint,
      use: 'sig',
      alg: 'RS256',
      n: keyExp.n,
      e: keyExp.e,
    }],
  };
  return jwks;
}

function issueGrafanaToken(user) {
  return issueJWT({
    userProfile: {
      username: user.username,
      email: user.email,
      name: user.name,
      grafana_role: 'Admin',
    },
    aud: 'grafana',
  });
}

async function inferUserData(attribute_key, value, user_data) {
  const data = {};
  // attribute_key can be email or cas_id
  if (attribute_key === 'cas_id') {
    const cas_id = value;
    data.cas_id = cas_id;
    data.email = user_data.email || `${cas_id}@iu.edu`;
    data.username = cas_id;
    data.name = user_data.name || cas_id;
  } else {
    const email = value;
    data.email = email;
    // extract username from email
    // eslint-disable-next-line prefer-destructuring
    data.username = email.split('@')[0];
    data.name = user_data.name || data.username;
  }
  // check if username is already used
  const username_res = await userService.findUserBy('username', data.username);
  if (username_res) {
    data.username = `${data.username}${Math.floor(Math.random() * 1000)}`;
    logger.warn(`Username conflict, new username: ${data.username}`);
  }
  return data;
}

async function getLoginUser(attribute_key, value, user_data = {}) {
  // find user by attribute_key and value
  // if a user is found:
  //    if the found user is active, return the user
  //    if the found user is not active, return null
  // if no user is found
  //    if auto_signup is enabled
  //      create a new user with the given data
  //      if there are conflicts with inferred username, append a random string
  //      return the new user
  // if auto_signup is not enabled, return null

  const user = await userService.findUserBy(attribute_key, value);
  if (user) {
    if (user.is_deleted) {
      return null;
    }
    return user;
  }
  if (config.get('auth.auto_sign_up.enabled')) {
    const data = await inferUserData(attribute_key, value, user_data);
    data.roles = [config.get('auth.auto_sign_up.default_role')];
    const new_user = await userService.createUser(data);
    return new_user;
  }
  return null;
}

function issueSignupToken({ email, nonce }) {
  const claim = {
    iss: config.get('auth.jwt.iss'),
    exp: (Date.now() + config.get('auth.signup.jwt.ttl_milliseconds')) / 1000,
    sub: email,
    scope: config.get('auth.signup.jwt.scope'),
    nonce,
  };
  return jsonwt.sign(claim, key, signOpt);
}

function issueToken(claim) {
  return jsonwt.sign(claim, key, signOpt);
}

module.exports = {
  onLogin,
  issueJWT,
  checkJWT,
  get_user_profile,
  get_download_token,
  find_or_create_test_user,
  get_upload_token,
  getJWKS,
  issueGrafanaToken,
  getLoginUser,
  issueSignupToken,
  issueToken,
};
