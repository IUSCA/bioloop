const { randomUUID } = require('node:crypto');
const { post, get } = require('./index');

/**
 * Creates a role-specific test user, auto-filling required fields when omitted.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, role: 'admin'|'operator'|'user', data?: Record<string, any>}=} params
 * @returns {Promise<Record<string, any>>}
 */
const createTestUser = async ({
  requestContext,
  token,
  role,
  data = {},
} = {}) => {
  const payload = {};
  payload.username = !data.username
    ? await generateUniqueUsername({ requestContext, token, baseUsername: role })
    : data.username;
  payload.email = !data.email ? `${payload.username}@iu.edu` : data.email;
  payload.name = !data.name ? payload.username : data.name;
  payload.cas_id = !data.cas_id ? payload.username : data.cas_id;

  const response = await post({
    requestContext,
    url: '/users',
    token,
    data: {
      ...payload,
      roles: [role],
    },
  });
  const body = await response.json();
  return body;
};

/**
 * Generates a unique username by probing `/users/:username`.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, baseUsername?: string}} params
 * @returns {Promise<string>}
 * @throws {Error} When generated username already exists.
 */
const generateUniqueUsername = async ({
  requestContext,
  token,
  baseUsername = 'testUser',
}) => {
  const candidate = baseUsername ? `${baseUsername}-${randomUUID()}` : randomUUID();

  const response = await get({
    requestContext,
    url: `/users/${candidate}`,
    token,
  });

  // If user doesn't exist (404), username is available
  if (response.status() === 404) {
    return candidate;
  }

  throw new Error(`Could not generate unique username. Generated name ${candidate} already exists.`);
};

/**
 * Returns an existing user for the given role (from e2e config) or creates one.
 * Useful in test setup when you need a user of a specific role but don't care
 * whether it already exists from a prior seed or test run.
 *
 * @param {Object}  params
 * @param {string}  params.token - Admin-level auth token
 * @param {string}  params.role  - Role name ('admin', 'operator', 'user')
 * @returns {Promise<Object>} The user object
 */
const ensureRoleUser = async ({ token, role }) => {
  const config = require('config');
  const username = config.e2e.users[role].username;

  const response = await get({
    token,
    url: `/users/${username}`,
  });

  if (response.status() === 200) {
    return response.json();
  }

  return createTestUser({
    token,
    role,
    data: { username },
  });
};

module.exports = {
  createTestUser,
  ensureRoleUser,
  generateUniqueUsername,
};
