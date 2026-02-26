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

const router = express.Router();

// create a new dataset

// create many datasets in batch

// get dataset by id

// search datasets

// modify dataset metadata

// archive dataset

// add associations between datasets (parent-child relationships)

// files routes for a dataset
router.use(
  '/:dataset_id/files',
  validate([param('dataset_id').isInt().toInt()]),
  require('./files'),
);

// workflow routes for a dataset
router.use(
  '/:dataset_id/workflows',
  validate([param('dataset_id').isInt().toInt()]),
  require('./workflows'),
);

module.exports = router;
