const { apiPrefix } = require('config');

const authHeader = (token) => (
  `Bearer ${token}`
);

const prefixedUrl = (url) => {
  const urlWithLeadingSlash = url.startsWith('/') ? url : `/${url}`;
  return `${apiPrefix}${urlWithLeadingSlash}`;
};

module.exports = {
  authHeader,
  prefixedUrl,
};
