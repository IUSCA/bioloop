const express = require('express');
// const { query, body } = require('express-validator');
// const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');

// const logger = require('../services/logger');
// const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');

const prisma = new PrismaClient();
const isPermittedTo = accessControl('notification.preference');
const router = express.Router();

router.get(
  '/:username',
  isPermittedTo('read', { checkOwnerShip: true }),
  asyncHandler(async (req, res) => {
    const { username } = req.params;

    const preferences = await prisma.notification_preference.findMany({
      where: {
        user: {
          username,
        },
      },
    });

    res.json(preferences);
  }),
);

module.exports = router;
