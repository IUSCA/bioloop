const { request } = require('@playwright/test');
const config = require('config');

const { authHeader } = require('./utils');

const normalizeUrl = (url) => (url.startsWith('/') ? url : `/${url}`);

const absoluteUrl = (url) => `${config.apiBaseURL}${normalizeUrl(url)}`;

const getContext = async (requestContext) => requestContext || request.newContext({
  baseURL: config.apiBaseURL,
});

const get = async ({
  requestContext, token, url, params,
}) => {
  const context = await getContext(requestContext);
  return context.get(absoluteUrl(url), {
    params,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

const post = async ({
  requestContext, token, url, data,
}) => {
  const context = await getContext(requestContext);
  return context.post(absoluteUrl(url), {
    data,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

const patch = async ({
  requestContext, token, url, data,
}) => {
  const context = await getContext(requestContext);
  return context.patch(absoluteUrl(url), {
    data,
    headers: {
      ...(token && { Authorization: authHeader(token) }),
    },
  });
};

const deleteApi = async ({
  requestContext, token, url, params,
}) => {
  const context = await getContext(requestContext);
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
  deleteApi,
};
