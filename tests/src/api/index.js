const { request } = require('@playwright/test');
const config = require('config');

const { authHeader } = require('./utils');

const normalizeUrl = (url) => (url.startsWith('/') ? url : `/${url}`);

const absoluteUrl = (url) => `${config.apiBaseURL}${normalizeUrl(url)}`;

const getRequestContext = async (requestContext) => requestContext || request.newContext({
  // ignoreHTTPSErrors is required when the Vite dev server uses a self-signed TLS cert
  // (the default for the Docker dev/e2e environment).
  ignoreHTTPSErrors: true,
  baseURL: config.apiBaseURL,
});

const get = async ({
  requestContext,
  token,
  url,
  params,
}) => {
  const context = await getRequestContext(requestContext);
  return context.get(absoluteUrl(url), {
    params,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

const post = async ({
  requestContext,
  token,
  url,
  data,
}) => {
  const context = await getRequestContext(requestContext);
  return context.post(absoluteUrl(url), {
    data,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

const patch = async ({
  requestContext,
  token,
  url,
  data,
}) => {
  const context = await getRequestContext(requestContext);
  return context.patch(absoluteUrl(url), {
    data,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

const put = async ({
  requestContext,
  token,
  url,
  data,
}) => {
  const context = await getRequestContext(requestContext);
  return context.put(absoluteUrl(url), {
    data,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

const deleteApi = async ({
  requestContext,
  token,
  url,
  params,
}) => {
  const context = await getRequestContext(requestContext);
  return context.delete(absoluteUrl(url), {
    params,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

module.exports = {
  get,
  post,
  patch,
  put,
  deleteApi,
};
