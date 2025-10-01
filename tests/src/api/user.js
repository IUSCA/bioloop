const { post, get } = require('./index');

const createTestUser = async ({
  requestContext, token, role, data = {},
} = {}) => {
  const payload = {};
  payload.username = !data.username
    ? await generateUniqueUsername({ requestContext, token })
    : data.username;
  payload.email = !data.email ? `${payload.username}@iu.edu` : data.email;
  payload.name = !data.name ? payload.username : data.name;
  payload.cas_id = !data.cas_id ? payload.username : data.cas_id;

  // console.log('payload', payload);

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
  requestContext, token,
}) => {
  let username = 'test_user';
  let suffix = 1;

  while (true) {
    const response = await get({
      requestContext,
      url: `/users/${username}`,
      token,
    });

    // If user doesn't exist (404), username is available
    if (response.status() === 404) {
      return username;
    }

    // user exists, try next username
    if (response.ok()) {
      username = `${username}_${suffix}`;
      suffix += 1;
    } else {
      throw new Error(`Failed to check username availability (status: ${response.status()})`);
    }
  }
};

module.exports = {
  createTestUser,
  generateUniqueUsername,
};
