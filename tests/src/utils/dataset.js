const { randomUUID } = require('crypto');
const { datasetExists } = require('../api/dataset');

async function generate_unique_dataset_name({
  requestContext,
  token,
  baseName = 'test_dataset',
  selectedDatasetType = 'DATA_PRODUCT',
}) {
  // Raw Data -> RAW_DATA
  // Data Product -> DATA_PRODUCT
  const _selected_dataset_type = selectedDatasetType.toUpperCase().split(' ').join('_');
  console.log('_selected_dataset_type', _selected_dataset_type);

  console.log('generating unique dataset name');
  while (true) {
    const uuid = randomUUID();
    const candidate = `${baseName}_${uuid}`;
    console.log('candidate', candidate);

    const response = await datasetExists({
      requestContext,
      token,
      params: {
        name: candidate,
        type: _selected_dataset_type,
      },
    });

    console.log('response.json()', await response.json());

    if (!response.ok()) {
      throw new Error(`Failed to verify dataset uniqueness (status: ${response.status()})`);
    }

    const { exists } = await response.json();
    console.log('exists', exists);

    if (!exists) {
      console.log('candidate is unique', candidate);
      return candidate;
    }

    console.log('uuid collision detected, generating new uuid');
  }
}

module.exports = {
  generate_unique_dataset_name,
};
