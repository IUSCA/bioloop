const { apiPrefix, baseURL } = require('config');

const authHeader = (token) => (
  `Bearer ${token}`
);

const prefixedApiPath = (url) => {
  const urlWithLeadingSlash = url.startsWith('/') ? url : `/${url}`;
  return `/${apiPrefix}${urlWithLeadingSlash}`;
};

const prefixedAppApiPath = ({ queryParamsStr, resourcePrefix = '' } = {}) => `${baseURL}/${apiPrefix}/${resourcePrefix}`.concat(!queryParamsStr ? '' : `?${queryParamsStr}`);

module.exports = {
  authHeader,
  prefixedApiPath,
  prefixedAppApiPath,
};
