const assert = require('assert');
const config = require('config');

const prisma = require('@/db');
const logger = require('@/services/logger');
const wfService = require('@/services/workflow');
const { DONE_STATUSES } = require('@/constants');

/**
 * The workflows a caller may launch on a dataset, and the policy action each one needs.
 *
 * Config decides this, not the route: adding a workflow to `workflow_policy_actions` makes it
 * runnable, and leaving it out keeps it internal. `delete` is deliberately absent — it runs as
 * a consequence of archiving a dataset, never because somebody asked for it directly.
 *
 * Kept beside `workflow_registry` rather than inside it, because the legacy dataset service
 * builds its workflow payload by spreading a registry entry, and would send this to the
 * workflow service.
 * @see .todo/issues/06-dataset-actions-workflows.md — Phase 3
 *
 * @returns {string[]} registered workflow names that can be launched
 */
function runnableWorkflows() {
  return Object.keys(config.get('workflow_policy_actions'))
    .filter((name) => config.workflow_registry.has(name));
}

/**
 * The dataset policy action that gates launching or resuming a workflow.
 *
 * @param {string} wf_name
 * @returns {string|null} the action name, or null when the workflow is not one a caller may launch
 */
function policyActionFor(wf_name) {
  const actions = config.get('workflow_policy_actions');
  return Object.prototype.hasOwnProperty.call(actions, wf_name) ? actions[wf_name] : null;
}

/**
 * Fills in what Postgres does not hold about a dataset's runs.
 *
 * The `workflow` table stores an id, the dataset it belongs to, and who started it. Name,
 * status, and task runs live in the workflow service, so they are fetched and merged here.
 * An unreachable workflow service yields an empty list rather than failing the caller, the
 * same choice the legacy dataset service makes.
 *
 * @param {{id: string}[]} rows - workflow rows for one dataset
 * @param {object} [options] - forwarded to the workflow service
 * @returns {Promise<object[]>} enriched runs, or [] when the service cannot be reached
 */
async function enrichWorkflows(rows, {
  last_task_run = false, prev_task_runs = false, only_active = false,
} = {}) {
  if (!rows?.length) return [];

  try {
    const res = await wfService.getAll({
      only_active,
      last_task_run,
      prev_task_runs,
      workflow_ids: rows.map((row) => row.id),
    });
    return res.data.results.map((wf) => ({
      ...wf,
      ...rows.find((row) => row.id === wf.id),
    }));
  } catch (error) {
    logger.error(`Unable to reach the workflow service for dataset runs: ${error.message}`);
    return [];
  }
}

/**
 * One run, confirmed to belong to the given dataset.
 *
 * The association lives in Postgres and the run's name lives in the workflow service, and
 * both are needed: the first stops a caller acting on another dataset's run through a
 * dataset they can reach, the second decides which policy action gates the act.
 *
 * @param {string} resource_id - the dataset's resource UUID
 * @param {string} workflow_id
 * @returns {Promise<{id: string, name: string, status: string}|null>} null when the run does
 *   not exist, does not belong to this dataset, or the workflow service cannot be reached
 */
async function findDatasetRun(resource_id, workflow_id) {
  const dataset = await prisma.dataset.findUnique({
    where: { resource_id },
    select: { id: true },
  });
  if (!dataset) return null;

  const row = await prisma.workflow.findFirst({
    where: { id: workflow_id, dataset_id: dataset.id },
    select: { id: true },
  });
  if (!row) return null;

  const [run] = await enrichWorkflows([row]);
  return run ?? null;
}

/**
 * Every run associated with a dataset, addressed by its resource id.
 *
 * @param {string} resource_id - the dataset's resource UUID
 * @param {object} [options] - forwarded to enrichWorkflows
 * @returns {Promise<object[]|null>} the runs, or null when no such dataset exists
 */
async function listDatasetWorkflows(resource_id, options = {}) {
  const dataset = await prisma.dataset.findUnique({
    where: { resource_id },
    select: { id: true, workflows: { select: { id: true, initiator: true } } },
  });
  if (!dataset) return null;

  return enrichWorkflows(dataset.workflows, options);
}

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
  findDatasetRun,
  runnableWorkflows,
  policyActionFor,
  enrichWorkflows,
  listDatasetWorkflows,
};
