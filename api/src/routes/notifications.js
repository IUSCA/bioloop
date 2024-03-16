const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  query, param, body,
} = require('express-validator');
const _ = require('lodash/fp');

// const logger = require('../services/logger');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');

const isPermittedTo = accessControl('notifications');

const router = express.Router();
const prisma = new PrismaClient();

router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('active').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    const filterQuery = _.omitBy(_.isUndefined)({
      active: req.query.active || true,
    });

    const notifications = await prisma.notification.findMany({
      where: filterQuery,
      include: {
        dataset_action_items: {
          include: {
            dataset: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // console.dir(notifications, { depth: null });
    res.json(notifications);
  }),
);

router.put(
  '/:id/:status',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    param('status').escape().notEmpty().isIn(['ACKNOWLEDGED', 'RESOLVED']),
  ]),
  asyncHandler(async (req, res, next) => {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        status: req.params.status,
      },
    });
    res.json(notification);
  }),
);

router.post(
  '/',
  isPermittedTo('update'),
  validate([
    body('type').escape().notEmpty(),
    body('label').optional().escape().notEmpty(),
    body('text').optional().escape().notEmpty(),
    body('dataset_action_items').optional().isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    const {
      type, label, text, dataset_action_items,
    } = req.body;

    const createActionItemsQuery = {
      ...(dataset_action_items
          && {
            dataset_action_items: {
              create: dataset_action_items.map((actionItem) => ({
                type: actionItem.type,
                dataset_id: actionItem.dataset_id,
                metadata: actionItem.metadata,
                ingestion_checks: {
                  create: actionItem.ingestion_checks,
                },
              })),
            },
          }),
    };

    const createQuery = {
      data: {
        type,
        label,
        text,
        ...createActionItemsQuery,
      },
    };

    const notification = await prisma.notification.create(createQuery);
    res.json(notification);
  }),
);

router.get(
  '/notifications/:id',
  isPermittedTo('read'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const notifications = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
      },
    });

    res.json(notifications);
  }),
);

module.exports = router;
