const { randomUUID } = require('crypto');

const { get, post } = require('./index');
const { extractTokenPayload } = require('../utils');

/**
 * Creates a source → derived relationship between two datasets.
 * Calls POST /datasets/associations.
 *
 * @param {Object} params
 * @param {number} params.sourceId   - ID of the source (upstream) dataset
 * @param {number} params.derivedId  - ID of the derived (downstream) dataset
 */
const createDatasetAssociation = async ({
  requestContext,
  token,
  sourceId,
  derivedId,
}) => post({
  requestContext,
  url: '/datasets/associations',
  token,
  data: [{ source_id: sourceId, derived_id: derivedId }],
});

const createDataset = async ({
  requestContext, token, data = {},
} = {}) => {
  const payload = { ...data };
  if (!data.name) {
    payload.name = await generateUniqueDatasetName({
      requestContext,
      token,
    });
  }
  if (!data.type) {
    payload.type = 'DATA_PRODUCT';
  }
  if (!data.origin_path) {
    payload.origin_path = `/path/to/${payload.name}`;
  }
  const response = await post({
    requestContext,
    url: '/datasets',
    token,
    data: payload,
  });
  const body = await response.json();
  return body;
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

const generateUniqueDatasetName = async ({
  requestContext,
  token,
  baseName = 'TestDataset',
  type = 'DATA_PRODUCT',
}) => {
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
};

module.exports = {
  createDataset,
  createDatasetAssociation,
  datasetExists,
  generateUniqueDatasetName,
  getDatasets,
};
