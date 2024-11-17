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
const { dataset_write_check } = require('../services/dataset');
const workflowService = require('../services/workflow');
const CONSTANTS = require('../constants');

const isPermittedTo = accessControl('datasets');

const router = express.Router();
const prisma = new PrismaClient();

const buildDatasetNotificationsForAuthorizedRolesQuery = ({ user_id, role_id } = {}) => ({
  OR: [
    {
      user_notifications: {
        some: {
          user_id,
        },
      },
    },
    {
      role_notifications: {
        some: {
          role_id,
        },
      },
    },
  ],
});

// Build query to filter `notification` objects
const buildNotificationsFilterQuery = ({ status } = {}) => {
  const notificationFilterQuery = _.omitBy(_.isUndefined)({
    status,
  });
  return Object.entries(notificationFilterQuery).length > 0 ? notificationFilterQuery : undefined;
};

// Build query to filter `dataset` objects
const buildDatasetsFilterQuery = ({ dataset_id, dataset_state } = {}) => {
  if (dataset_id) {
    // No need to filter by other attributes if an ID is provided
    return { dataset_id };
  }
  const datasetFilterQuery = {
    ...(dataset_state && {
      states: {
        some: {
          // todo - check if dataset's latest state == dataset_state instead?
          state: dataset_state,
        },
      },
    }),
  };
  return Object.entries(datasetFilterQuery).length > 0 ? datasetFilterQuery : undefined;
};

router.get(
  '/:dataset_id',
  isPermittedTo('read'),
  validate([
    param('dataset_id').isInt().toInt(),
    query('type').optional().escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get a single dataset's notifications

    const { type } = req.query;

    const currentUserRole = req.user.roles[0];

    const datasetFilterQuery = buildDatasetsFilterQuery({ dataset_id: req.params.dataset_id });

    // build query that will be used to filter `dataset_notification` objects
    // based on the corresponding `dataset` objects
    const datasetNotificationFilterQuery = {
      ...(!!datasetFilterQuery && { dataset: datasetFilterQuery }),
      type,
    };

    const datasetNotifications = await prisma.$transaction(async (tx) => {
      const matching_user_roles = await tx.role.findMany({
        where: {
          name: currentUserRole,
        },
      });
      const user_role = matching_user_roles[0];

      const filteredNotifications = await tx.dataset_notification.findMany({
        where: {
          ...datasetNotificationFilterQuery,
          ...buildDatasetNotificationsForAuthorizedRolesQuery({ user_id: req.user.id, role_id: user_role.id }),
        },
        include: {
          dataset: {
            action_items: true,
          },
        },
      });
      return filteredNotifications;
    });

    res.json(datasetNotifications);
  }),
);

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

    const notificationFilterQuery = buildNotificationsFilterQuery({ status: req.query.status });
    const datasetFilterQuery = buildDatasetsFilterQuery({ dataset_state: req.query.dataset_state });

    // build query that will be used to filter `dataset_notification` objects
    // based on the corresponding `dataset` and `notification` objects
    const datasetNotificationFilterQuery = {
      ...notificationFilterQuery,
      ...datasetFilterQuery,
    };

    const notifications = await prisma.$transaction(async (tx) => {
      const matching_user_roles = await tx.role.findMany({
        where: {
          name: currentUserRole,
        },
      });
      const user_role = matching_user_roles[0];

      // todo - returns dataset notifications now
      const filteredNotifications = await tx.dataset_notification.findMany({
        where: {
          ...datasetNotificationFilterQuery,
          ...buildDatasetNotificationsForAuthorizedRolesQuery({ user_id: req.user.id, role_id: user_role.id }),
        },
        include: {
          dataset: {
            action_items: true,
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

// todo - delete by dataset_ID/notification_Id here instead
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

router.patch(
  '/:dataset_notification_id',
  isPermittedTo('update'),
  validate([
    param('dataset_notification_id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Datasets']
    // #swagger.summary = patch an action item associated with a dataset.
    // #swagger.description = provided `ingestion_checks` will overwrite
    // existing ingestion checks associated with this action item.

    const { ingestion_checks = [] } = req.body;

    // const dataset = await prisma.dataset.findUnique({
    //   where: {
    //     id: req.params.id,
    //   },
    //   include: {
    //     ...CONSTANTS.INCLUDE_STATES,
    //   },
    // });

    // // delete existing checks associated with this action item
    // update_queries.push(prisma.dataset_duplication_analysis_check.deleteMany({
    //   where: {
    //     action_item_id: req.params.action_item_id,
    //   },
    // }));

    const updatedNotification = await prisma.$transaction(async (tx) => {
      const notificationActionItems = await tx.dataset_action_item.findMany({
        where: {
          dataset_notification_id: req.params.dataset_notification_id,
        },
        include: {
          action_items: true,
        },
      });
      const duplicationNotificationActionItemId = notificationActionItems[0].id;
      const updated = await tx.dataset_notification.update({
        where: {
          id: duplicationNotificationActionItemId,
        },
        data: {
          action_items: {
            update: {
              data: {
                ingestion_checks: {
                  createMany: { data: ingestion_checks },
                },
              },
            },
          },
        },
      });
      return updated;
    });

    res.json(updatedNotification);
  }),
);

module.exports = router;
