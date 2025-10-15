const { ALERT_TYPE } = require('@prisma/client');
const express = require('express');
const {
  body, query, param,
} = require('express-validator');
const he = require('he');
const createError = require('http-errors');

const prisma = require('@/db');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const CONSTANTS = require('../constants');
// const logger = require('../services/logger'); // Removed unused import

const isPermittedTo = accessControl('alerts');

const router = express.Router();

// helper method to evaluate the `status` field of an alert based on start/end times
const evaluateAlertStatus = (alert) => {
  const now = new Date();

  if (!alert.start_time && !alert.end_time) {
    return null;
  }

  // If alert has start_time but no end_time
  if (alert.start_time && !alert.end_time) {
    return now >= new Date(alert.start_time) ? CONSTANTS.ALERT_STATUSES.ACTIVE : CONSTANTS.ALERT_STATUSES.SCHEDULED;
  }

  // If alert has end_time but no start_time
  if (!alert.start_time && alert.end_time) {
    return now >= new Date(alert.end_time) ? CONSTANTS.ALERT_STATUSES.EXPIRED : CONSTANTS.ALERT_STATUSES.ACTIVE;
  }

  // If alert has both start_time and end_time
  if (alert.start_time && alert.end_time) {
    const startTime = new Date(alert.start_time);
    const endTime = new Date(alert.end_time);

    if (now < startTime) {
      return CONSTANTS.ALERT_STATUSES.SCHEDULED;
    }
    if (now >= startTime && now <= endTime) {
      return CONSTANTS.ALERT_STATUSES.ACTIVE;
    }
    return CONSTANTS.ALERT_STATUSES.EXPIRED;
  }

  return null;
};

// helper method to add calculated `status` field to alerts
const addStatusToAlerts = (alerts) => (Array.isArray(alerts)
  ? alerts.map((alert) => ({ ...alert, status: evaluateAlertStatus(alert) }))
  : { ...alerts, status: evaluateAlertStatus(alerts) });

// Get all alerts
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('label').optional().isString(),
    query('message').optional().isString(),
    query('type').optional().isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    query('start_time[lt]').optional().isISO8601(),
    query('start_time[lte]').optional().isISO8601(),
    query('start_time[gt]').optional().isISO8601(),
    query('start_time[gte]').optional().isISO8601(),
    query('end_time[lt]').optional().isISO8601(),
    query('end_time[lte]').optional().isISO8601(),
    query('end_time[gt]').optional().isISO8601(),
    query('end_time[gte]').optional().isISO8601(),
    query('is_hidden').optional().isBoolean().toBoolean(),
    query('status').optional().isIn(Object.values(CONSTANTS.ALERT_STATUSES)),
    query('limit').optional().isInt(),
    query('offset').optional().isInt({ min: 0 }),
    query('sort_by').optional().isString(),
    query('sort_order').optional().default('desc').isIn(['asc', 'desc']),
  ]),
  asyncHandler(async (req, res, next) => {
    const {
      label, message, type, limit, offset, is_hidden, status,
    } = req.query;

    console.log('req.query', req.query);

    const sort_by = req.query.sort_by || 'created_at';
    const sort_order = req.query.sort_order || 'desc';

    const time_range_filters = {};

    // Parse time filters - expect objects like {gte: someDate, lte: someDate}
    ['start_time', 'end_time'].forEach((time_field) => {
      if (req.query[time_field] && typeof req.query[time_field] === 'object') {
        time_range_filters[time_field] = {};
        Object.keys(req.query[time_field]).forEach((operator) => {
          const value = req.query[time_field][operator];
          if (value) {
            time_range_filters[time_field][operator] = new Date(value);
          }
        });
      }
    });

    console.log('time_range_filters', time_range_filters);

    // Status and date fields cannot be used together
    if (status && (Object.keys(time_range_filters).length > 0)) {
      return next(createError(400, 'Cannot use status filter with date/time filters'));
    }

    // Cannot have conflicting operators for same field
    ['start_time', 'end_time'].forEach((field) => {
      const filters = time_range_filters[field];
      if (filters) {
        if ((filters.lte && filters.lt) || (filters.gte && filters.gt)) {
          return next(createError(400, `Cannot use conflicting operators for ${field}`));
        }
      }
    });

    // start/end date validation
    if (time_range_filters.start_time && time_range_filters.end_time) {
      // Get the start/end times from start_time and end_time filters
      const start_time_filters = time_range_filters.start_time;
      const start_time = start_time_filters.gte || start_time_filters.gt; // Only one of the two will be present
      const end_time_filters = time_range_filters.end_time;
      const end_time = end_time_filters.lte || end_time_filters.lt; // Only one of the two will be present

      if (start_time && end_time && start_time >= end_time) {
        return next(createError(400, 'Invalid time range: start_time must be before end_time'));
      }
    }

    let where = {
      ...(label && { label: { contains: label, mode: 'insensitive' } }),
      ...(message && { message: { contains: message, mode: 'insensitive' } }),
      ...(type && { type }),
      ...(is_hidden != null && { is_hidden }),
    };

    console.log('where', where);

    // Add status-based filtering logic
    if (status) {
      console.log('status', status);
      const now = new Date();

      switch (status) {
        case CONSTANTS.ALERT_STATUSES.ACTIVE:
          console.log('CONSTANTS.ALERT_STATUSES.ACTIVE');
          // ACTIVE: start_time <= now AND (end_time > now OR end_time is null)
          where.AND = [
            {
              OR: [
                { start_time: null },
                { start_time: { lte: now } },
              ],
            },
            {
              OR: [
                { end_time: null },
                { end_time: { gt: now } },
              ],
            },
          ];
          break;
        case CONSTANTS.ALERT_STATUSES.SCHEDULED:
          console.log('CONSTANTS.ALERT_STATUSES.SCHEDULED');
          // SCHEDULED: start_time > now
          where.start_time = { gt: now };
          break;
        case CONSTANTS.ALERT_STATUSES.EXPIRED:
          console.log('CONSTANTS.ALERT_STATUSES.EXPIRED');
          // EXPIRED: end_time < now
          where.end_time = { lt: now };
          break;
        default:
          console.log('default');
          break;
      }
    }

    where = { ...where, ...time_range_filters };
    console.log('where', where);

    const [alerts, count] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          created_by: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
        take: parseInt(limit, 10) || 10,
        skip: parseInt(offset, 10) || 0,
        ...(sort_by && { orderBy: { [sort_by]: sort_order } }),
      }),
      prisma.alert.count({ where }),
    ]);

    console.log('alerts', alerts);

    const alertsWithStatus = addStatusToAlerts(alerts);

    console.log('alertsWithStatus', alertsWithStatus);

    res.json({
      alerts: alertsWithStatus,
      metadata: { count },
    });
  }),
);

// Create a new alert
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('label').optional({ nullable: true }).isString().trim()
      .escape(),
    body('message').optional({ nullable: true }).isString().trim()
      .escape(),
    body('type').isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('start_time').optional({ nullable: true }).isISO8601(),
    body('end_time').optional({ nullable: true }).isISO8601(),
    body('is_hidden').optional({ nullable: true }).isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const {
      label, message, type, start_time, end_time, is_hidden,
    } = req.body;

    const created_by_id = req.user.id;

    const newAlert = await prisma.alert.create({
      data: {
        label,
        message: message ? he.decode(message) : null,
        type,
        created_by_id,
        ...(start_time && { start_time: new Date(start_time) }),
        ...(end_time && { end_time: new Date(end_time) }),
        ...(is_hidden != null && { is_hidden }),
      },
    });

    const alertWithStatus = addStatusToAlerts(newAlert);
    res.json(alertWithStatus);
  }),
);

// Update an existing alert
router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt(),
    body('label').optional({ nullable: true }).isString().trim(),
    body('message').optional({ nullable: true }).isString().trim(),
    body('type').optional().isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('start_time').optional({ nullable: true }).isISO8601(),
    body('end_time').optional({ nullable: true }).isISO8601(),
    body('is_hidden').optional({ nullable: true }).isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      label, message, type, start_time, end_time, is_hidden,
    } = req.body;

    const start_time_updates = {};
    if (start_time === null) {
      start_time_updates.start_time = null;
    } else if (start_time !== undefined) {
      start_time_updates.start_time = new Date(start_time);
    }
    const end_time_updates = {};
    if (end_time === null) {
      end_time_updates.end_time = null;
    } else if (end_time !== undefined) {
      end_time_updates.end_time = new Date(end_time);
    }

    const updatedAlert = await prisma.alert.update({
      where: { id: parseInt(id, 10) },
      data: {
        label,
        message: message ? he.decode(message) : null,
        type,
        ...start_time_updates,
        ...end_time_updates,
        ...(is_hidden != null && { is_hidden }),
      },
    });

    const alertWithStatus = addStatusToAlerts(updatedAlert);
    res.json(alertWithStatus);
  }),
);

router.get('/types', asyncHandler(async (req, res) => {
  res.json(Object.values(ALERT_TYPE));
}));

router.get('/statuses', asyncHandler(async (req, res) => {
  res.json(Object.values(CONSTANTS.ALERT_STATUSES));
}));

// Delete an alert
// router.delete(
//   '/:id',
//   isPermittedTo('delete'),
//   validate([
//     param('id').isInt(),
//   ]),
//   asyncHandler(async (req, res) => {
//     const { id } = req.params;
//
//     try {
//       await prisma.alert.update({
//         where: { id: parseInt(id) },
//         data: {
//           active: false,
//         },
//       });
//       res.status(204).send();
//     } catch (error) {
//       res.status(500).json({ error: 'Failed to delete alert' });
//     }
//   }),
// );

module.exports = router;
