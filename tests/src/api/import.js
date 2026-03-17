const { get } = require('./index');

/**
 * Get all configured import sources.
 */
const getImportSources = async ({ requestContext, token } = {}) => get({
  requestContext,
  url: '/datasets/imports/sources',
  token,
});

module.exports = {
  getImportSources,
};
