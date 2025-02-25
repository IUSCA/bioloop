const express = require('express');
// const { query, body } = require('express-validator');
// const createError = require('http-errors');
// const { PrismaClient } = require('@prisma/client');

// const logger = require('../services/logger');
// const { validate } = require('../middleware/validators');
// const asyncHandler = require('../middleware/asyncHandler');
// const { accessControl } = require('../middleware/auth');

// const prisma = new PrismaClient();
// const isPermittedTo = accessControl('user');
const router = express.Router();

router.use('/preferences', require('./preferences'));
router.use('/subscriptions', require('./subscriptions'));
router.use('/event_types', require('./event_types'));

module.exports = router;
