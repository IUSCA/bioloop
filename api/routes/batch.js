const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const { query, param } = require('express-validator');

// const logger = require('../logger');
const asyncHandler = require('../middleware/asyncHandler');
const validator = require('../middleware/validator');

const router = express.Router();
const prisma = new PrismaClient();

router.get(
  '/',
  query('include_checksums').toBoolean().default(false),
  validator(async (req, res, next) => {
    const batches = await prisma.batch.findMany({
      include: {
        checksum: req.query.include_checksums,
      },
    });
    res.json(batches);
  }),
);

router.get(
  '/:id',
  param('id').isInt().toInt(),
  query('include_checksums').toBoolean().default(false),
  validator(async (req, res, next) => {
    const batch = await prisma.batch.findFirst({
      where: {
        id: req.params.id,
      },
      include: {
        checksum: req.query.include_checksums,
      },
    });

    if (batch) { res.json(batch); } else { next(createError(404)); }
  }),
);

router.post('/', asyncHandler(async (req, res, next) => {
  const batchData = req.body;

  const batch = await prisma.batch.create({
    data: batchData,
  });

  res.json(batch);
}));

router.patch(
  '/:id',
  param('id').isInt().toInt(),
  validator(async (req, res, next) => {
    const batchToUpdate = await prisma.batch.findFirst({
      where: {
        id: req.params.id,
      },
    });
    if (!batchToUpdate) { return next(createError(404)); }

    const batch = await prisma.batch.update({
      where: {
        id: req.params.id,
      },
      data: req.body,
    });
    res.json(batch);
  }),
);

router.post(
  '/:id/checksums',
  param('id').isInt().toInt(),
  validator(async (req, res, next) => {
    const checksums = req.body.map((c) => ({
      batch_id: req.params.id,
      path: c.path,
      md5: c.md5,
    }));

    await prisma.checksum.createMany({
      data: checksums,
    });

    res.sendStatus(200);
  }),
);

module.exports = router;
