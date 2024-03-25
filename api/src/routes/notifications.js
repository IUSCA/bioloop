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
    query('by_active_action_items').optional().toBoolean(),
    query('active').optional().toBoolean(),
    query('status').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Filter notifications

    // by_active_action_items - fetch notifications whose action items have not
    // been acknowledged
    const filterQuery = _.omitBy(_.isUndefined)({
      dataset_action_items: req.query.by_active_action_items ? {
        some: {
          status: 'CREATED',
        },
      } : undefined,
      active: req.query.active || true,
      status: req.query.status || 'CREATED',
    });

    const notifications = await prisma.notification.findMany({
      where: {
        ...filterQuery,
      },
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

    res.json(notifications);
  }),
);

router.get(
  '/notifications/:id',
  isPermittedTo('read'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get notification by id

    const notifications = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
      },
    });

    res.json(notifications);
  }),
);

module.exports = router;
