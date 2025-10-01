const { get } = require('./index');
const { extractTokenPayload } = require('../utils');

const datasetExists = async ({
  requestContext, token, params,
}) => {
  const url = `/datasets/${params.type}/${params.name}/exists`;
  return get({
    requestContext,
    url,
    token,
  });
};

const getDatasets = async ({
  requestContext, token, params,
}) => {
  const decoded = extractTokenPayload(token);
  const url = (decoded?.profile?.roles?.includes('admin') || decoded?.profile?.roles?.includes('operator'))
    ? '/datasets'
    : `/datasets/${decoded?.profile?.username}/all`;
  return get({
    requestContext,
    url,
    token,
    params,
  });
};

module.exports = {
  datasetExists,
  getDatasets,
};
