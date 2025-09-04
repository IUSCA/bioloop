const express = require('express');
const { PrismaClient } = require('@prisma/client');

// const logger = require('../services/logger');
const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');

const prisma = new PrismaClient();
const isPermittedTo = accessControl('conversion');
const router = express.Router();

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Conversion Definitions']
    const rows = await prisma.dynamic_variable.findMany();
    res.json(rows);
  }),
);

router.put(
  '/:name',
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Conversion Definitions']
    const { name } = req.params;
    const { description } = req.body;
    const row = await prisma.dynamic_variable.upsert({
      where: {
        name,
      },
      update: {
        description,
      },
      create: {
        name,
        description,
      },
    });
    res.json(row);
  }),
);

module.exports = router;
