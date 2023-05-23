/* eslint-disable no-console */
const path = require('path');
const assert = require('assert');

global.__basedir = path.join(__dirname, '..', '..');

require('dotenv-safe').config();
require('../db');

const userService = require('../services/user');
const authService = require('../services/auth');

async function issue_token(username) {
  const user = await userService.findActiveUserBy('username', username);
  assert(user, 'user not found');
  const userProfile = authService.get_user_profile(user);
  const token = authService.issueJWT({ userProfile, forever: true });
  return token;
}

// check if username argument is present
if (process.argv.length < 3) {
  console.error('Error: Missing username argument');
  process.exit(1);
}

// get username argument
const username = process.argv[2];

issue_token(username)
  .then((token) => { console.log(token); })
  .catch((err) => { console.error(err); });
