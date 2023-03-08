const fs = require('fs');
const path = require('path');

const jsonwt = require('jsonwebtoken');
const _ = require('lodash/fp');
const config = require('config');

const logger = require('./logger');
const userService = require('./user');

const key = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.key')));
const pub = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.pub')));
const signOpt = {
  algorithm: config.get('auth.jwt.sign_algorithm'),
};

function issueJWT(userProfile) {
  const claim = {
    iss: config.get('auth.jwt.iss'),
    exp: (Date.now() + config.get('auth.jwt.ttl_milliseconds')) / 1000,
    sub: userProfile.username,
    profile: userProfile,
  };
  return jsonwt.sign(claim, key, signOpt);
}

async function onLogin(user) {
  await userService.updateLastLogin(user.id);

  const userProfile = _.pick(['username', 'email', 'name', 'roles', 'cas_id'])(user);

  const token = issueJWT(userProfile);
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

module.exports = {
  onLogin,
  issueJWT,
  checkJWT,
};
