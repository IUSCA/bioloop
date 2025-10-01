const { randomUUID } = require('node:crypto');
const { post, get } = require('./index');

const createTestUser = async ({
  requestContext, token, role, data = {},
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

const generateUniqueUsername = async ({
  requestContext, token, baseUsername = 'testUser',
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

const getRole = async ({ requestContext, token, role }) => {
  const response = await get({
    requestContext,
    url: `/users/${role}`,
    token,
  });
};

module.exports = {
  createTestUser,
  generateUniqueUsername,
};
