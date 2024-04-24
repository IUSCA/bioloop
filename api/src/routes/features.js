const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { param, body } = require('express-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const { authenticate } = require('../middleware/auth');
const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');

const router = express.Router();
// const prisma = new PrismaClient();
const prisma = new PrismaClient(
  {
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
      {
        emit: 'event',
        level: 'error',
      },
    ],
  },
);

['query', 'info', 'warn', 'error'].forEach((level) => {
  prisma.$on(level, async (e) => {
    console.log(`QUERY: ${e.query}`);
    console.log(`PARAMS: ${e.params}`);
  });
});

const isPermittedTo = accessControl('settings');

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    const ret = await prisma.feature_flag.findMany({
      where: {},
      orderBy: {
        feature: 'asc',
      },
      take: 100,
    });
    // setTimeout(() => {
    res.json(ret);
    // }, 2000);
  }),
);

router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('enabled').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    console.log(req.body);

    const { feature, enabled } = req.body;

    const updatedFeatureFlag = await prisma.feature_flag.update({
      where: {
        id: req.params.id,
      },
      data: {
        feature,
        enabled,
        last_updated_by_id: req.user.id,
      },
    });

    // setTimeout(() => {
    res.json(updatedFeatureFlag);
    // }, 5000);
  }),
);

router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('label').notEmpty().escape(),
    body('enabled').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    console.log(req.body);

    const { label, enabled } = req.body;

    console.log(req.user.id);

    const updatedFeatureFlag = await prisma.feature_flag.create({
      data: {
        feature: label.toUpperCase().split(' ').join('_'),
        label,
        enabled,
        last_updated_by_id: req.user.id,
      },
    });

    // setTimeout(() => {
    res.json(updatedFeatureFlag);
    // }, 2000);
  }),
);

module.exports = router;
