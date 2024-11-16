const express = require('express');
const { body, query, param } = require('express-validator');
const config = require('config');
const _ = require('lodash/fp');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const createError = require('http-errors');
const logger = require('../services/logger');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const datasetService = require('../services/dataset');
const workflowService = require('../services/workflow');
const { INCLUDE_DATASET_UPLOAD_LOG_RELATIONS } = require('../constants');

const UPLOAD_PATH = config.upload.path;

const isPermittedTo = accessControl('datasets');

const router = express.Router();
const prisma = new PrismaClient();

// Build query to filter `notification` objects
const buildNotificationFilterQuery = ({ status } = {}) => _.omitBy(_.isUndefined)({
  status,
});

// Build query to filter `dataset` objects
const buildDatasetFilterQuery = ({ dataset_state } = {}) => {
  const datasetFilterQuery = {
    ...(dataset_state && {
      dataset: {
        states: {
          some: {
          // todo - check if dataset's latest state == dataset_state instead?
            state: dataset_state,
          },
        },
      },
    }),
  };
  return Object.entries(datasetFilterQuery).length > 0 ? datasetFilterQuery : undefined;
};

router.get(
  '/',
  isPermittedTo('read'),
  validate([
    // query('by_active_action_items').optional().toBoolean(),
    query('status').optional().escape().notEmpty(),
    query('dataset_state').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get filtered dataset notifications

    const currentUserRole = req.user.roles[0];

    // use dataset_action_items filter on :/dataset_id/notifications
    // will need to use single get endpoint for all notifications
    // use notification_action_item > dataset_action_item instead?

    const notificationFilterQuery = buildNotificationFilterQuery({ status: req.query.status });
    const datasetFilterQuery = buildDatasetFilterQuery({ dataset_state: req.query.dataset_state });

    // build query that will be used to filter `dataset_notification` objects
    // based on the corresponding `dataset` and `notification` objects
    const datasetNotificationFilterQuery = {
      ...notificationFilterQuery,
      ...datasetFilterQuery,
    };

    // todo - retain check - replace with status

    const notifications = await prisma.$transaction(async (tx) => {
      const matching_user_roles = await tx.role.findMany({
        where: {
          name: currentUserRole,
        },
      });
      const user_role = matching_user_roles[0];

      // todo - return dataset notifications now
      const filteredNotifications = await tx.dataset_notification.findMany({
        where: {
          ...datasetNotificationFilterQuery,
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
        include: {
          dataset_action_items: {
            include: {
              dataset: true,
            },
          },
        },
      });
      return filteredNotifications;
    });

    res.json(notifications);
  }),
);

router.post(
  '/:dataset_id',
  isPermittedTo('create'),
  validate([
    param('dataset_id').isInt().toInt(),
    body('label').escape().notEmpty(),
    body('text').escape().notEmpty(),
    body('role_ids').isArray().optional(),
    body('user_ids').isArray().optional(),
    body('action_item').isObject.optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Post a dataset notification

    const {
      action_item, user_ids, role_ids, label, text,
    } = req.body;

    if (user_ids?.length === 0 && role_ids?.length === 0) {
      return next(createError.BadRequest('A user or user role must be specified as the recipient of the notification'));
    }

    const created_dataset_notification = await prisma.dataset_notification.create({
      data: {
        dataset: {
          connect: {
            id: req.params.dataset_id,
          },
        },
        notification: {
          label,
          text,
          ...(role_ids?.length > 0 && {
            role_notifications: {
              createMany: {
                data: role_ids.map((id) => (
                  {
                    role_id: id,
                  }
                )),
              },
            },
          }),
          ...(user_ids?.length > 0 && {
            user_notifications: {
              createMany: {
                data: user_ids.map((id) => (
                  {
                    user_id: id,
                  }
                )),
              },
            },
          }),
        },
        ...(action_item && {
          type: action_item.type,
          title: action_item.title,
          text: action_item.text,
          to: action_item.to,
          metadata: action_item.metadata,
          ingestion_checks: {
            createMany: { data: action_item.ingestion_checks },
          },
        }),
      },
    });

    res.json(created_dataset_notification);
  }),
);

// todo - this should have a better way of selecting the notification to delete
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
