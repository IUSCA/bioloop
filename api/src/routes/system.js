const express = require('express');
// const { param, query, body } = require('express-validator');

const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
// const { validate } = require('@/middleware/validators');
const systemService = require('@/services/system');

const isPermittedTo = accessControl('system');

const router = express.Router();

router.get(
  '/stats',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
  // #swagger.tags = ['System']
  // #swagger.summary = 'Get system-wide statistics about groups, datasets, collections, users, and grants'
    const stats = await systemService.getSystemStats();
    res.json(stats);
  }),
);

module.exports = router;
