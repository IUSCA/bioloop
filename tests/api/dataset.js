const { get } = require('./index');

const getDatasets = async ({
  requestContext, token, params,
}) => get({
  requestContext, url: '/datasets', token, params,
});

module.exports = {
  getDatasets,
};
