const { request } = require('@playwright/test');
const config = require('config');

const { authHeader } = require('./utils');

/** @param {string} url @returns {string} URL path prefixed with `/`. */
const normalizeUrl = (url) => (url.startsWith('/') ? url : `/${url}`);

/** @param {string} url @returns {string} Absolute API URL rooted at `config.apiBaseURL`. */
const absoluteUrl = (url) => `${config.apiBaseURL}${normalizeUrl(url)}`;

/**
 * Returns the provided request context or creates a new one configured for the
 * API base URL.
 *
 * @param {import('@playwright/test').APIRequestContext=} requestContext
 * @returns {Promise<import('@playwright/test').APIRequestContext>}
 */
const getRequestContext = async (requestContext) => requestContext || request.newContext({
  baseURL: config.apiBaseURL,
});

/**
 * Sends a GET request against the API.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token?: string, url: string, params?: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Sends a POST request against the API.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token?: string, url: string, data?: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Sends a PATCH request against the API.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token?: string, url: string, data?: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Sends a PUT request against the API.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token?: string, url: string, data?: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Sends a DELETE request against the API.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token?: string, url: string, params?: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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
