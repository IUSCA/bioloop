// Sub-router for workflow-related routes on a dataset.
// req.params.dataset_id is validated in the parent router (index.js).

const express = require('express');
const { param } = require('express-validator');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const prisma = require('@/db');
const logger = require('@/services/logger');
const CONSTANTS = require('@/constants');
const workflowService = require('@/services/datasets_v2/workflows');
const datasetService = require('@/services/datasets_v2');

const router = express.Router();

// All routes authorize against the parent dataset identified by dataset_id.
const byDatasetId = { resourceIdFn: (req) => req.params.dataset_id };

// Dynamic action selection: stage → request_stage, integrated → compute
const authorizeWorkflowRun = (req, res, next) => {
  const action = req.params.workflow_type === CONSTANTS.WORKFLOWS.STAGE
    ? 'request_stage'
    : 'compute';
  return authorize('dataset', action, byDatasetId)(req, res, next);
};

// Create and launch a workflow for a dataset
router.post(
  '/run/:workflow_type',
  validate([
    param('workflow_type').isIn([
      CONSTANTS.WORKFLOWS.INTEGRATED,
      CONSTANTS.WORKFLOWS.STAGE,
    ]),
  ]),
  authorizeWorkflowRun,
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and launch an integrated or stage workflow for a dataset
    const { dataset_id, workflow_type } = req.params;

    const dataset = await datasetService.getDataset({
      id: dataset_id,
      workflows: true,
    });

    if (!dataset) return next(createError(404, 'Dataset not found'));

    if (workflow_type === CONSTANTS.WORKFLOWS.STAGE) {
      try {
        await prisma.stage_request_log.create({
          data: { dataset_id, user_id: req.user.id },
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

// Associate an existing workflow ID with a dataset
router.put(
  '/:workflow_id',
  authorize('dataset', 'edit_metadata', byDatasetId),
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

// TODO
// create a workflow and launch it for a dataset
// router.post(
//   '/run/:workflow_type',
//   validate([
//     param('workflow_type').isIn([
//       CONSTANTS.WORKFLOWS.INTEGRATED,
//       CONSTANTS.WORKFLOWS.STAGE,
//     ]),
//   ]),
//   asyncHandler(async (req, res, next) => {
//   // #swagger.tags = ['datasets']
//   // #swagger.summary = Create and run a workflow for a dataset
//     const { dataset_id, workflow_type } = req.params;
//   }),
// );

// add workflow ids to dataset
router.put(
  '/:workflow_id',
  asyncHandler(async (req, res, next) => {
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
