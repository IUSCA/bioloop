const assert = require('assert');
const config = require('config');

const prisma = require('@/db');
const { assertPossible, check, withStateFields } = require('@/state').import('dataset');
const logger = require('@/services/logger');
const wfService = require('@/services/workflow');
const { DONE_STATUSES } = require('@/constants');
const createError = require('http-errors');

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

  // The action a run needs is config, so the state check reads the same entry rather than
  // naming one here. A run nothing maps to is refused before the workflow service is called.
  const action = policyActionFor(wf_name);
  if (!action) {
    throw createError.BadRequest(`No policy action is defined for workflow ${wf_name}`);
  }
  // The callers pass rows fetched in different ways, so the state is read here rather than
  // taken off the argument.
  assertPossible(action, await prisma.dataset.findUniqueOrThrow(withStateFields({
    where: { id: dataset.id },
    select: { id: true },
  })));

  const active_same_name = dataset.workflows
    .filter((wf) => wf.name === wf_body.name)
    .filter((wf) => !DONE_STATUSES.includes(wf.status));

  // 409, not an assert: the UI tells a duplicate apart from a server failure by this status.
  if (active_same_name.length > 0) {
    throw createError.Conflict('A workflow with the same name is either pending / running');
  }

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

/**
 * The most datasets one bulk stage request may name.
 *
 * Matches the batch limit on POST /v2/datasets/bulk. It is a protocol bound rather than a
 * tuning knob: each dataset costs a workflow-service round trip and a staging job, so an
 * uncapped "stage all" on a large collection would queue unbounded work from one click.
 */
const MAX_BULK_STAGE = 100;

/**
 * Starts one stage run, taking the dataset's existing runs into account.
 *
 * @param {object} dataset - a row with `id`
 * @param {number} [initiator_id]
 * @returns {Promise<object>} the created workflow
 */
async function startStageRun(dataset, initiator_id) {
  const rows = await prisma.workflow.findMany({
    where: { dataset_id: dataset.id },
    select: { id: true },
  });
  const runs = await enrichWorkflows(rows);

  return createWorkflow({
    dataset: { ...dataset, workflows: runs },
    wf_name: 'stage',
    initiator_id,
  });
}

/**
 * Starts a stage run on each of several datasets, reporting each outcome separately.
 *
 * A dataset the caller may not stage does not fail the batch, because refusing the whole
 * request would make "stage all" unusable for exactly the people who hold access to part of
 * a collection.
 *
 * Both collaborators are injected so the decision and the side effect stay separable, and so
 * a test can drive the buckets without a workflow service.
 *
 * @param {object[]} datasets - rows with `id`, `resource_id`, `name`, and `is_staged`, plus the
 *   fields the dataset's `request_stage` state rule reads: `is_deleted` and
 *   `owner_group.is_archived`. Every dataset read in `fetch.js` supplies them for the whole page.
 * @param {object} options
 * @param {function(string): Promise<boolean>} options.permits - whether the caller may stage
 *   the dataset with that resource id
 * @param {function(object, number): Promise<object>} [options.startRun] - starts one run
 * @param {number} [options.initiator_id]
 * @returns {Promise<{staged: object[], denied: object[], skipped: object[]}>}
 */
async function bulkStage(datasets, { permits, startRun = startStageRun, initiator_id } = {}) {
  const staged = [];
  const denied = [];
  const skipped = [];

  for (const dataset of datasets) {
    const summary = { resource_id: dataset.resource_id, name: dataset.name };
    // The rule is a pure function of the row, and the caller fetched the page in one query, so
    // the fields are already here. Querying per row, or re-querying the page, would make this
    // function depend on the database for something its argument already carries.
    const refusal = check('request_stage', dataset);

    // eslint-disable-next-line no-await-in-loop
    const allowed = await permits(dataset.resource_id);

    if (!allowed) {
      denied.push(summary);
    } else if (refusal) {
      // A state refusal is not a permission refusal: the caller may stage it, and the dataset
      // cannot be staged right now.
      skipped.push({ ...summary, reason: refusal.message });
    } else if (dataset.is_staged) {
      skipped.push({ ...summary, reason: 'already staged' });
    } else {
      try {
        // eslint-disable-next-line no-await-in-loop
        const wf = await startRun(dataset, initiator_id);
        staged.push({ ...summary, workflow_id: wf.workflow_id });
      } catch (error) {
        // createWorkflow asserts when a run of the same name is already pending. That is a
        // reason to leave this dataset alone, not a reason to fail the others.
        skipped.push({ ...summary, reason: error.message });
      }
    }
  }

  return { staged, denied, skipped };
}

module.exports = {
  MAX_BULK_STAGE,
  bulkStage,
  startStageRun,
  createWorkflow,
  findDatasetRun,
  runnableWorkflows,
  policyActionFor,
  enrichWorkflows,
  listDatasetWorkflows,
};
