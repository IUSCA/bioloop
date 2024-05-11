const config = require('config');

const createdDuplicateDataset = async ({ request, token, datasetId }) => {
  const createResponse = await request.post(`${config.apiBasePath}/datasets/${datasetId}/duplicate`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  const createdDataset = await createResponse.json();

  console.log('createdDataset');
  console.log(createdDataset);

  return createdDataset;
};

const getDataset = async ({ request, token, datasetId }) => {
  const response = await request.get(`${config.apiBasePath}/datasets/${datasetId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  const dataset = await response.json();
  return dataset;
};

const getDatasets = async ({ request, token, filters = {} }) => {
  const response = await request.get(`${config.apiBasePath}/datasets`, {
    params: filters,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
  });
  const datasets = await response.json();
  return datasets;
};

const deleteDuplicates = async ({ request, token }) => {
  const response = await request.delete(`${config.apiBasePath}/datasets`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    ignoreHTTPSErrors: true,
    params: {
      is_duplicate: true,
    },
  });
  await response.json();
};

module.exports = {
  createdDuplicateDataset,
  getDataset,
  getDatasets,
  deleteDuplicates,
};
