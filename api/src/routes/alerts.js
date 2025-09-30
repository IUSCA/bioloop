const express = require('express');
const {
  body, query, param,
} = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const he = require('he');

const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const CONSTANTS = require('../constants');
const logger = require('../services/logger');

const isPermittedTo = accessControl('alerts');

const router = express.Router();

const prisma = new PrismaClient();

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
    query('is_active').optional().isBoolean().toBoolean(),
    query('limit').optional().isInt(),
    query('offset').optional().isInt({ min: 0 }),
    query('sort_by').optional().isString(),
    query('sort_order').optional().default('desc').isIn(['asc', 'desc']),
  ]),
  asyncHandler(async (req, res) => {
    const {
      label, message, type,
      limit, offset, is_active,
    } = req.query;

    const sort_by = req.query.sort_by || 'created_at';
    const sort_order = req.query.sort_order || 'desc';

    let where = {
      ...(label && { label: { contains: label, mode: 'insensitive' } }),
      ...(message && { message: { contains: message, mode: 'insensitive' } }),
      ...(type && { type }),
      ...(is_active != null && { is_active }),
    };

    const time_range_filters = {};

    // Parse start_time operators
    ['lt', 'lte', 'gt', 'gte'].forEach((operator) => {
      const value = req.query[`start_time[${operator}]`];
      if (value) {
        if (!time_range_filters.start_time) {
          time_range_filters.start_time = {};
        }
        time_range_filters.start_time[operator] = new Date(value);
      }
    });

    // Parse end_time operators
    ['lt', 'lte', 'gt', 'gte'].forEach((operator) => {
      const value = req.query[`end_time[${operator}]`];
      if (value) {
        if (!time_range_filters.end_time) {
          time_range_filters.end_time = {};
        }
        time_range_filters.end_time[operator] = new Date(value);
      }
    });

    where = { ...where, ...time_range_filters };

    try {
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
          take: parseInt(limit) || 10,
          skip: parseInt(offset) || 0,
          ...(sort_by && { orderBy: { [sort_by]: sort_order } }),
        }),
        prisma.alert.count({ where }),
      ]);

      res.json({
        alerts,
        metadata: { count },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch alerts' });
      logger.error(error);
    }
  }),
);

// Create a new alert
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('label').notEmpty().isString().trim()
      .escape(),
    body('message').optional({ nullable: true }).isString().trim()
      .escape(),
    body('type').isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('start_time').optional({ nullable: true }).isISO8601(),
    body('end_time').optional({ nullable: true }).isISO8601(),
    body('is_active').optional({ nullable: true }).isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const {
      label, message, type, start_time, end_time, is_active,
    } = req.body;

    const created_by_id = req.user.id;

    try {
      const newAlert = await prisma.alert.create({
        data: {
          label,
          message: message ? he.decode(message) : null,
          type,
          created_by_id,
          ...(start_time && { start_time: new Date(start_time) }),
          ...(end_time && { end_time: new Date(end_time) }),
          ...(is_active != null && { is_active }),
        },
      });
      res.status(201).json(newAlert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create alert' });
      logger.error(error);
    }
  }),
);

// Update an existing alert
router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt(),
    body('label').notEmpty().escape().optional({ nullable: true }),
    body('message').optional({ nullable: true })
      .isString().trim()
      .escape(),
    body('type').optional().isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('start_time').optional({ nullable: true }).isISO8601(),
    body('end_time').optional({ nullable: true }).isISO8601(),
    body('is_active').optional({ nullable: true }).isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      label, message, type, start_time, end_time, is_active,
    } = req.body;

    console.log('typeof start_time:', typeof start_time);
    console.log('typeof end_time:', typeof end_time);
    console.dir(req.body, { depth: null });

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

    try {
      const updatedAlert = await prisma.alert.update({
        where: { id: parseInt(id) },
        data: {
          label,
          message: message ? he.decode(message) : null,
          type,
          ...start_time_updates,
          ...end_time_updates,
          ...(is_active != null && { is_active }),
        },
      });
      res.json(updatedAlert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update alert' });
      logger.error(error);
    }
  }),
);

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
