const { randomUUID } = require('crypto');

const { get, post } = require('./index');
const { extractTokenPayload } = require('../utils');

const createDataset = async ({
  requestContext, token, data,
}) => post({
  requestContext, url: '/datasets', token, data,
});

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

async function generate_unique_dataset_name({
  requestContext,
  token,
  baseName = 'test_dataset',
  type = 'DATA_PRODUCT',
}) {
  if (!['Raw Data', 'Data Product', 'RAW_DATA', 'DATA_PRODUCT'].includes(type)) {
    throw new Error(`Invalid dataset type: ${type}`);
  }

  // Raw Data     -> RAW_DATA
  // Data Product -> DATA_PRODUCT
  const selectedDatasetType = type.toUpperCase().split(' ').join('_');

  const uuid = randomUUID();
  const candidate = baseName ? `${baseName}-${uuid}` : uuid;

  const response = await datasetExists({
    requestContext,
    token,
    params: {
      name: candidate,
      type: selectedDatasetType,
    },
  });

  const { exists } = await response.json();

  if (!exists) {
    return candidate;
  }
  throw new Error(`Could not generate unique dataset name. Generated name ${candidate} already exists.`);
}

module.exports = {
  createDataset,
  datasetExists,
  generate_unique_dataset_name,
  getDatasets,
};
