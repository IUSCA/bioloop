const { randomUUID } = require('crypto');

const { get, post } = require('./index');
const { extractTokenPayload } = require('../utils');

/**
 * Creates a dataset using API defaults when core fields are omitted.
 *
 * Defaults applied:
 * - `name`: generated unique name
 * - `type`: `DATA_PRODUCT`
 * - `origin_path`: `/path/to/<name>`
 *
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, data?: Record<string, any>}=} params
 * @returns {Promise<Record<string, any>>} Created dataset payload.
 */
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

/**
 * Fetches datasets for the authenticated role.
 *
 * Admin/operator uses `/datasets`; user uses ownership-scoped
 * `/datasets/:username/all`.
 *
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, params?: Record<string, any>}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Checks whether a dataset name already exists for a given dataset type.
 * @param {{requestContext?: import('@playwright/test').APIRequestContext, token: string, params: {type: string, name: string}}} params
 * @returns {Promise<import('@playwright/test').APIResponse>}
 */
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

/**
 * Generates a unique dataset name by probing the exists endpoint once.
 *
 * @param {Object} params
 * @param {import('@playwright/test').APIRequestContext=} params.requestContext
 * @param {string} params.token
 * @param {string=} params.baseName
 * @param {'Raw Data'|'Data Product'|'RAW_DATA'|'DATA_PRODUCT'} params.type
 * @returns {Promise<string>}
 * @throws {Error} When type is invalid or generated name already exists.
 */
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
  datasetExists,
  generateUniqueDatasetName,
  getDatasets,
};
