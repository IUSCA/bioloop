const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  query, body, param,
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
    query('status').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get filtered notifications

    // req.query.by_active_action_items: fetch notifications whose action items
    // have not been acknowledged
    const filterQuery = _.omitBy(_.isUndefined)({
      dataset_action_items: req.query.by_active_action_items ? {
        some: {
          status: 'CREATED',
        },
      } : undefined,
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

router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('label').escape().notEmpty(),
    body('text').escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Post a notification

    const createdNotification = await prisma.notification.create({
      data: {
        ...req.body,
      },
    });

    res.json(createdNotification);
  }),
);

router.delete(
  '/',
  isPermittedTo('delete'),
  validate([
    query('status').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Delete matching notifications

    const queryParams = req.query;

    if (Object.keys(queryParams).length === 0) {
      res.send({
        count: 0,
      });
      return;
    }

    const updatedCount = await prisma.notification.updateMany({
      where: queryParams,
      data: {
        status: 'RESOLVED',
      },
    });

    res.json(updatedCount);
  }),
);

module.exports = router;
