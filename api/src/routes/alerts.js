const express = require('express');
const {
  body, query, param,
} = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

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
    query('start_time').optional().isISO8601(),
    query('start_time_operator').optional().isIn(['lt', 'lte', 'gt', 'gte']),
    query('end_time').optional().isISO8601(),
    query('end_time_operator').optional().isIn(['lt', 'lte', 'gt', 'gte']),
    query('active').optional().isBoolean().toBoolean(),
    query('limit').optional().isInt(),
    query('offset').optional().isInt({ min: 0 }),
    query('sort_by').optional().isString(),
    query('sort_order').optional().default('desc').isIn(['asc', 'desc']),

  ]),
  asyncHandler(async (req, res) => {
    const {
      label, message, type, start_time, start_time_operator, end_time, end_time_operator,
      active, limit, offset,
    } = req.query;

    console.log('active:', active);

    console.log('start_time:', start_time);
    console.log('end_time:', end_time);

    const sort_by = req.query.sort_by || 'created_at';
    const sort_order = req.query.sort_order || 'desc';

    let where = {
      ...(label && { label: { contains: label, mode: 'insensitive' } }),
      ...(message && { message: { contains: message, mode: 'insensitive' } }),
      ...(type && { type }),
    };

    let time_range_filters = {};
    const currentTime = new Date();
    console.log('currentTime:', currentTime);

    if (active === true) {
      time_range_filters = {
        start_time: { lte: currentTime },
        OR: [
          { end_time: { gte: currentTime } },
          { end_time: null },
        ],
      };
    } else {
      if (start_time) {
        const operator = start_time_operator || 'gte';
        time_range_filters.start_time = { [operator]: new Date(start_time) };
      }
      if (end_time) {
        const operator = end_time_operator || 'lte';
        time_range_filters.end_time = { [operator]: new Date(end_time) };
      }
    }

    console.log('time_range_filters:');
    console.dir(time_range_filters, { depth: null });

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

      alerts.forEach((alert) => {
        console.log('id:', alert.id, 'label:', alert.label);
        console.log('start_time:', alert.start_time);
        console.log('end_time:', alert.end_time);
      });

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
    body('message').optional().isString().trim()
      .escape(),
    body('type').isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('start_time').isISO8601(),
    body('end_time').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const {
      label, message, type, start_time, end_time,
    } = req.body;

    console.log(req.body);

    const created_by_id = req.user.id;

    try {
      const newAlert = await prisma.alert.create({
        data: {
          label,
          message,
          type,
          created_by_id,
          ...(start_time && { start_time: new Date(start_time) }),
          ...(end_time && { end_time: new Date(end_time) }),
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
    body('label').optional().isString().trim()
      .escape(),
    body('message').optional().isString().trim()
      .escape(),
    body('type').optional().isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('start_time').optional({ nullable: true }).isISO8601(),
    body('end_time').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      label, message, type, start_time, end_time,
    } = req.body;

    try {
      const updatedAlert = await prisma.alert.update({
        where: { id: parseInt(id) },
        data: {
          label,
          message,
          type,
          ...(start_time && { start_time: new Date(start_time) }),
          ...(end_time && { end_time: new Date(end_time) }),
        },
      });
      res.json(updatedAlert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update alert' });
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
