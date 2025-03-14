const express = require('express');
// const { query, body, param } = require('express-validator');
// const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');

// const logger = require('../services/logger');
// const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');

const prisma = new PrismaClient();
const isPermittedTo = accessControl('notification.subscription');
const router = express.Router();

router.get(
  '/:username',
  isPermittedTo('read', { checkOwnerShip: true }),
  asyncHandler(async (req, res) => {
    const { username } = req.params;

    const subscriptions = await prisma.notification_subscription.findMany({
      where: {
        user: {
          username,
        },
      },
      include: {
        event_type: true,
      },
    });

    res.json(subscriptions);
  }),
);

module.exports = router;
