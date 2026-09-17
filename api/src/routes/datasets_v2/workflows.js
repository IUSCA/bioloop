// Sub-router for workflow-related routes on a dataset.
// req.params.dataset_id is validated in the parent router (index.js).

const express = require('express');
const { param, query } = require('express-validator');
const createError = require('http-errors');
const config = require('config');

const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const authorization = require('@/authorization');
const prisma = require('@/db');
const logger = require('@/services/logger');
const CONSTANTS = require('@/constants');
const wfService = require('@/services/workflow');
const workflowService = require('@/services/datasets_v2/workflows');
const datasetService = require('@/services/datasets_v2');

// mergeParams, so :dataset_id from the parent router reaches these handlers. Without it
// every route here authorizes and queries against undefined.
const router = express.Router({ mergeParams: true });

const { createAuthorizationMiddleware: authorize } = authorization;

// All routes authorize against the parent dataset identified by dataset_id.
const byDatasetId = { resourceIdFn: (req) => req.params.dataset_id };

// Which policy action gates a run is config, not a branch here. Every configured action is bound
// at load, so an action the dataset container does not declare fails at startup. A workflow
// that names no action is refused rather than defaulted to something permissive.
const WORKFLOW_ACTIONS = config.get('workflow_policy_actions');
const authorizeRunByWorkflow = _.mapValues((action) => authorize('dataset', action, byDatasetId))(WORKFLOW_ACTIONS);
const decideRunByWorkflow = _.mapValues((action) => authorization.import('dataset').action(action))(WORKFLOW_ACTIONS);

const authorizeWorkflowRun = (req, res, next) => {
  if (!workflowService.policyActionFor(req.params.workflow_type)) {
    return next(createError(400, `No policy action is defined for workflow ${req.params.workflow_type}`));
  }
  return authorizeRunByWorkflow[req.params.workflow_type](req, res, next);
};

// Every run associated with this dataset.
//
// Gated by view_workflows, which admits the owning group's admins and its oversight and
// nobody else: a run carries step names, error traces, and filesystem paths, and the
// attribute filters already withhold paths from grant holders.
// @see .todo/issues/06-dataset-actions-workflows.md — Who sees the tab, and who can act
router.get(
  '/',
  validate([
    query('last_task_run').optional().toBoolean(),
    query('prev_task_runs').optional().toBoolean(),
    query('only_active').optional().toBoolean(),
  ]),
  authorize('dataset', 'view_workflows', byDatasetId),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = List the workflow runs associated with a dataset
    const workflows = await workflowService.listDatasetWorkflows(
      req.params.dataset_id,
      _.pick(['last_task_run', 'prev_task_runs', 'only_active'])(req.query),
    );

    if (workflows === null) return next(createError(404, 'Dataset not found'));
    res.json(workflows);
  }),
);

// Create and launch a workflow for a dataset
router.post(
  '/run/:workflow_type',
  validate([
    param('workflow_type').isIn(workflowService.runnableWorkflows()),
  ]),
  authorizeWorkflowRun,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and launch an integrated or stage workflow for a dataset
    const { dataset_id, workflow_type } = req.params;

    // createWorkflow refuses a second run of the same name while one is pending, so it needs
    // the runs enriched with name and status. Postgres holds only their ids.
    const dataset = await datasetService.getDatasetById(dataset_id, {
      includes: { workflows: true },
    });

    if (!dataset) return next(createError(404, 'Dataset not found'));

    dataset.workflows = await workflowService.enrichWorkflows(dataset.workflows);

    if (workflow_type === CONSTANTS.WORKFLOWS.STAGE) {
      try {
        await prisma.stage_request_log.create({
          data: { dataset_id: dataset.id, user_id: req.user.id },
        });
      } catch (e) {
        logger.error('Error creating stage request log', e);
        return next(createError(500, 'Error creating stage request log'));
      }
    }

    logger.info(`Starting workflow ${workflow_type} on dataset ${dataset_id}`);
    const wf = await workflowService.createWorkflow({
      dataset,
      wf_name: workflow_type,
      initiator_id: req.user.id,
    });

    res.json(wf);
  }),
);

/**
 * Stop or resume one run.
 *
 * Authorized in the handler rather than by the middleware, because which action gates the
 * act depends on the run's name, and that has to be fetched first. Acting on a run needs the
 * same authority as starting one: resuming a failed stage run is starting a stage run.
 * @see .todo/issues/06-dataset-actions-workflows.md — Who sees the tab, and who can act
 */
const runControl = (verb) => asyncHandler(async (req, res, next) => {
  const { dataset_id, workflow_id } = req.params;

  const run = await workflowService.findDatasetRun(dataset_id, workflow_id);
  if (!run) return next(createError(404, 'Workflow not found for this dataset'));

  if (!workflowService.policyActionFor(run.name)) {
    return next(createError(400, `No policy action is defined for workflow ${run.name}`));
  }

  const decision = await decideRunByWorkflow[run.name]({
    identifiers: { user: req.user?.subject_id, resource: dataset_id },
    policyExecutionContext: req.policyContext,
    preFetched: { user: req.user, context: { req } },
  });
  if (!decision.granted) {
    return next(decision.status === 404
      ? createError.NotFound('Workflow not found for this dataset')
      : createError.Forbidden(`Not permitted to ${verb} runs on this dataset`));
  }

  logger.info(`${verb} workflow ${workflow_id} on dataset ${dataset_id}`);
  const result = await wfService[verb === 'stop' ? 'pause' : 'resume'](workflow_id);
  return res.json(result.data);
});

// #swagger.tags = ['datasets']
router.post('/:workflow_id/pause', runControl('stop'));
router.post('/:workflow_id/resume', runControl('resume'));

// Associate an existing workflow ID with a dataset
router.put(
  '/:workflow_id',
  authorize('dataset', 'edit', byDatasetId),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Associate a workflow to a dataset
    const { dataset_id, workflow_id } = req.params;

    await prisma.workflow.createMany({
      data: {
        id: workflow_id,
        dataset_id,
        initiator_id: req.user.id,
      },
      skipDuplicates: true,
    });

    res.status(204).send();
  }),
);

module.exports = router;
