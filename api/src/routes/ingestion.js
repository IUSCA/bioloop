const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { param, body, query } = require('express-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const _ = require('lodash/fp');

const config = require('config');
const { authenticate } = require('../middleware/auth');
const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');

const router = express.Router();
const prisma = new PrismaClient();

const isPermittedTo = accessControl('action_items');

router.get(
  '/action-items',
  validate([
    query('type').escape().notEmpty().isIn(Object.values(config.ACTION_ITEMS_TYPES)),
    query('dataset_id').isInt().toInt().optional(),
    query('active').optional().isBoolean().toBoolean(),
    query('acknowledged_by_id').isInt().toInt().optional(),
  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const filterQuery = _.omitBy(_.isUndefined)({
      type: req.query.type,
      dataset_id: req.query.id,
      active: req.query.active || true,
      acknowledged_by_id: req.query.acknowledged_by_id,
    });

    const actionItems = await prisma.ingestion_action_item.findMany({
      where: filterQuery,
      include: {
        dataset: true,
      },
    });
    res.json(actionItems);
  }),
);

router.post(
  '/action-items',
  isPermittedTo('create'),
  validate([
    body('type').escape().notEmpty(),
    body('label').optional().escape().notEmpty(),
    body('dataset_id').optional().isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const actionItem = await prisma.ingestion_action_item.create({
      data: {
        type: req.body.type,
        label: req.body.label,
        dataset_id: req.body.dataset_id,
      },
    });
    res.json(actionItem);
  }),
);

module.exports = router;
