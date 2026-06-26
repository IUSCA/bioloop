const assert = require('assert');
const config = require('config');

const prisma = require('@/db');
const wfService = require('@/services/workflow');
const { DONE_STATUSES } = require('@/constants');

function get_wf_body(wf_name) {
  assert(config.workflow_registry.has(wf_name), `${wf_name} workflow is not registered`);
  const wf_body = { ...config.workflow_registry[wf_name] };
  wf_body.name = wf_name;
  wf_body.app_id = config.app_id;
  wf_body.steps = wf_body.steps.map((step) => ({
    ...step,
    queue: step.queue || `${config.app_id}.q`,
  }));
  return wf_body;
}

/**
 * Creates a new workflow for a dataset and associates it.
 *
 * Requires `dataset.workflows` to be populated so that active-workflow
 * conflict detection can be performed before dispatching to the workflow
 * service.
 *
 * @param {Object} params
 * @param {Object} params.dataset       - Dataset object with `.workflows` loaded.
 * @param {string} params.wf_name       - Registered workflow name.
 * @param {number} [params.initiator_id] - ID of the user initiating the workflow.
 * @returns {Promise<Object>} The created workflow object returned by the workflow service.
 * @throws {AssertionError} If a workflow with the same name is already pending or running.
 */
async function createWorkflow({ dataset, wf_name, initiator_id }) {
  const wf_body = get_wf_body(wf_name);

  const active_same_name = dataset.workflows
    .filter((wf) => wf.name === wf_body.name)
    .filter((wf) => !DONE_STATUSES.includes(wf.status));

  assert(active_same_name.length === 0, 'A workflow with the same name is either pending / running');

  const wf = (await wfService.create({ ...wf_body, args: [dataset.id] })).data;

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
