const { authHeader, prefixedApiPath } = require('../utils/api');

const get = async ({
  requestContext, token, url, params,
}) => requestContext.get(url, {
  params,
  headers: {
    Authorization: authHeader(token),
  },
});

const post = async ({
  requestContext, token, url, data,
}) => requestContext.post(url, {
  data,
  headers: {
    Authorization: authHeader(token),
  },
});

const patch = async ({
  requestContext, token, url, data,
}) => requestContext.patch(url, {
  data,
  headers: {
    Authorization: authHeader(token),
  },
});

const deleteApi = async ({
  requestContext, token, url, params,
}) => requestContext.delete(url, {
  params,
  headers: {
    Authorization: authHeader(token),
  },
});

module.exports = {
  get,
  post,
  patch,
  deleteApi,
};
