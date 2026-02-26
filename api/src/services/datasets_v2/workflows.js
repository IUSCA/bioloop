const assert = require('assert');

const prisma = require('@/db');

/**
 * Creates a new workflow for a dataset.
 *
 * @async
 * @function createWorkflow
 * @param {Object} dataset - The dataset object for which the workflow is being created.
 * @param {string} wf_name - The name of the workflow to be created.
 * @param {number} initiator_id - The ID of the user initiating the workflow.
 * @throws {AssertionError} Throws an error if a workflow with the same name is already running or pending for the dataset.
 * @returns {Promise<Object>} The created workflow object.
 *
 * @description
 * This function performs the following steps:
 * 1. Retrieves the workflow body for the provided workflow name.
 * 2. Checks if there's already an active workflow with the same name for the given dataset.
 * 3. If no active workflow exists, it creates a new workflow using the workflow service.
 * 4. Associates the newly created workflow with the dataset in the database.
 * 5. Returns the created workflow object.
 */
async function createWorkflow({ dataset, wf_name, initiator_id }) {
  const wf_body = get_wf_body(wf_name);

  // check if a workflow with the same name is not already running / pending on
  // this dataset
  const active_wfs_with_same_name = dataset.workflows
    .filter((_wf) => _wf.name === wf_body.name)
    .filter((_wf) => !DONE_STATUSES.includes(_wf.status));

  assert(active_wfs_with_same_name.length === 0, 'A workflow with the same name is either pending / running');

  // create the workflow
  const wf = (await wfService.create({
    ...wf_body,
    args: [dataset.id],
  })).data;

  // add association to the dataset
  await prisma.workflow.create({
    data: {
      id: wf.workflow_id,
      dataset_id: dataset.id,
      ...(initiator_id && { initiator_id }),
    },
  });

  return wf;
}

module.exports = {
  createWorkflow,
};
