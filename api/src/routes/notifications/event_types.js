const express = require('express');
// const { query, body } = require('express-validator');
// const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');

// const logger = require('../services/logger');
// const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');

const prisma = new PrismaClient();
const isPermittedTo = accessControl('notification.event_type');
const router = express.Router();

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    const eventTypes = await prisma.notification_event_type.findMany();

    res.json(eventTypes);
  }),
);

router.post(
  '/',
  isPermittedTo('create'),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    const eventType = await prisma.notification_event_type.create({
      data: {
        name,
        description,
      },
    });

    res.json(eventType);
  }),
);

router.put(
  '/:id',
  isPermittedTo('update'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    const eventType = await prisma.notification_event_type.update({
      where: {
        id: Number(id),
      },
      data: {
        name,
        description,
      },
    });

    res.json(eventType);
  }),
);

router.delete(
  '/:id',
  isPermittedTo('delete'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    await prisma.notification_event_type.delete({
      where: {
        id: Number(id),
      },
    });

    res.status(204).end();
  }),
);

module.exports = router;
