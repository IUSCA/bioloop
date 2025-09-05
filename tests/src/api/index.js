const { authHeader, prefixedUrl } = require('./utils');

const get = async ({
  requestContext, token, url, params,
}) => requestContext.get(prefixedUrl(url), {
  params,
  headers: {
    Authorization: authHeader(token),
  },
});

const post = async ({
  requestContext, token, url, data,
}) => requestContext.post(prefixedUrl(url), {
  data,
  headers: {
    Authorization: authHeader(token),
  },
});

const patch = async ({
  requestContext, token, url, data,
}) => requestContext.patch(prefixedUrl(url), {
  data,
  headers: {
    Authorization: authHeader(token),
  },
});

const deleteApi = async ({
  requestContext, token, url, params,
}) => requestContext.delete(prefixedUrl(url), {
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
