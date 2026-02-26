// This module is a sub router for handling file-related routes for datasets.
// req.params.dataset_id is expected to be present in all routes, and is validated in the parent router (index.js).

const express = require('express');
const { param, query, body } = require('express-validator');
const createError = require('http-errors');
const _ = require('lodash/fp');
const { Prisma } = require('@prisma/client');
const assert = require('assert');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const collectionService = require('@/services/collections');
const prisma = require('@/db');
const { authorize } = require('@/authorization_todo/abac');
const { pickNonNil } = require('@/utils');
const CONSTANTS = require('@/constants');

const router = express.Router();

// create a workflow and launch it for a dataset
router.post(
  '/run/:workflow_type',
  validate([
    param('workflow_type').isIn([
      CONSTANTS.WORKFLOWS.INTEGRATED,
      CONSTANTS.WORKFLOWS.STAGE,
    ]),
  ]),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['datasets']
  // #swagger.summary = Create and run a workflow for a dataset
    const { dataset_id, workflow_type } = req.params;
  }),
);

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
