const express = require('express');
const {
  body, query, param, validationResult,
} = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const CONSTANTS = require('../constants');

const isPermittedTo = accessControl('alerts');

const router = express.Router();

const prisma = new PrismaClient();

// Get all alerts
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('label').optional().isString(),
    query('type').optional().isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    query('active').optional().isBoolean(),
    query('limit').optional().isInt(),
    query('offset').optional().isInt({ min: 0 }),
    query('sortBy').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const {
      label, type, active, limit, offset, sortBy,
    } = req.query;

    try {
      const where = {
        ...(label && { label: { contains: label, mode: 'insensitive' } }),
        ...(type && { type }),
        ...(active !== undefined && { active: active === 'true' }),
      };

      const [alerts, total] = await Promise.all([
        prisma.alert.findMany({
          where,
          include: { created_by: { select: { id: true, name: true, username: true } } },
          take: parseInt(limit) || 10,
          skip: parseInt(offset) || 0,
          ...(sortBy && { orderBy: { [sortBy]: 'asc' } }),
        }),
        prisma.alert.count({ where }),
      ]);

      res.json({ data: alerts, metadata: { total } });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  }),
);

// Create a new alert
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('label').notEmpty().isString().trim(),
    body('message').optional().isString().trim(),
    body('type').isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('active').isBoolean(),
    body('global').isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const {
      label, message, type, active, global,
    } = req.body;
    const created_by_id = req.user.id;

    try {
      const newAlert = await prisma.alert.create({
        data: {
          label, message, type, active, global, created_by_id,
        },
      });
      res.status(201).json(newAlert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create alert' });
    }
  }),
);

// Update an existing alert
router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt(),
    body('label').optional().isString().trim(),
    body('message').optional().isString().trim(),
    body('type').optional().isIn(Object.values(CONSTANTS.ALERT_TYPES)),
    body('active').optional().isBoolean(),
    body('global').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      label, message, type, global,
    } = req.body;

    try {
      const updatedAlert = await prisma.alert.update({
        where: { id: parseInt(id) },
        data: {
          label, message, type, global,
        },
      });
      res.json(updatedAlert);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update alert' });
    }
  }),
);

// Delete an alert
router.delete(
  '/:id',
  isPermittedTo('delete'),
  validate([
    param('id').isInt(),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
      await prisma.alert.update({
        where: { id: parseInt(id) },
        data: {
          active: false,
        },
      });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete alert' });
    }
  }),
);

module.exports = router;
