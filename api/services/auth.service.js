const fs = require('fs');
const path = require('path');

const jsonwt = require('jsonwebtoken');
const config = require('config');

const logger = require('./logger');
const userService = require('./user.service');

const key = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.key')));
const pub = fs.readFileSync(path.join(global.__basedir, config.get('auth.jwt.pub')));
const signOpt = {
  algorithm: config.get('auth.jwt.sign_algorithm'),
};

function issueJWT(user) {
  const claim = {
    iss: config.get('auth.jwt.iss'),
    exp: (Date.now() + config.get('auth.jwt.ttl')) / 1000,
    sub: user.id,
    user,
  };
  return {
    token: jsonwt.sign(claim, key, signOpt),
    user,
  };
}

async function onLogin(user) {
  await userService.updateLastLogin(user.id);

  const userProfile = {
    id: user.id,
    email: user.email,
    name: user.fullname,
    roles: user.roles,
    casid: user.casid,
  };

  return issueJWT(userProfile);
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
