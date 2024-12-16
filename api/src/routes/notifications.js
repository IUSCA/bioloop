const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  query, body,
} = require('express-validator');
const _ = require('lodash/fp');

// const logger = require('../services/logger');
const createError = require('http-errors');
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
    query('status').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get filtered notifications

    const currentUserRole = req.user.roles[0];

    const filterQuery = _.omitBy(_.isUndefined)({
      status: req.query.status || 'CREATED',
    });

    const notifications = await prisma.$transaction(async (tx) => {
      const matching_user_roles = await tx.role.findMany({
        where: {
          name: currentUserRole,
        },
      });
      const user_role = matching_user_roles[0];

      const filtered_notifications = await tx.notification.findMany({
        where: {
          ...filterQuery,
          OR: [
            {
              user_notifications: {
                some: {
                  user_id: req.user.id,
                },
              },
            },
            {
              role_notifications: {
                some: {
                  role_id: user_role.id,
                },
              },
            },
          ],
        },
      });
      return filtered_notifications;
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
    body('role_ids').isArray().optional(),
    body('user_ids').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Post a notification

    if (req.body.user_ids?.length === 0 && req.body.role_ids?.length === 0) {
      return next(createError.BadRequest('A user or user role must be specified as the recipient of the notification'));
    }

    const createdNotification = await prisma.notification.create({
      data: {
        label: req.body.label,
        text: req.body.text,
        ...(req.body.role_ids?.length > 0 && {
          role_notifications: {
            createMany: {
              data: req.body.role_ids.map((id) => (
                {
                  role_id: id,
                }
              )),
            },
          },
        }),
        ...(req.body.user_ids?.length > 0 && {
          user_notifications: {
            createMany: {
              data: req.body.user_ids.map((id) => (
                {
                  user_id: id,
                }
              )),
            },
          },
        }),
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
