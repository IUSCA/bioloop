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
    // only select path and md5 columns from the checksum table if include_checksums is true
    const checksumSelect = req.query.include_checksums ? {
      select: {
        path: true,
        md5: true,
      },
    } : false;
    const batches = await prisma.batch.findMany({
      include: {
        checksum: checksumSelect,
      },
    });
    // rename checksum property to metadata
    const result = batches.map((batch) => {
      const { checksum, ...rest } = batch;
      rest.metadata = checksum;
      return rest;
    });
    res.json(result);
  }),
);

router.get(
  '/:id',
  param('id').isInt().toInt(),
  query('include_checksums').toBoolean().default(false),
  validator(async (req, res, next) => {
    // only select path and md5 columns from the checksum table if include_checksums is true
    const checksumSelect = req.query.include_checksums ? {
      select: {
        path: true,
        md5: true,
      },
    } : false;
    const batch = await prisma.batch.findFirst({
      where: {
        id: req.params.id,
      },
      include: {
        checksum: checksumSelect,
      },
    });

    if (batch) {
      // rename checksum property to metadata
      const { checksum, ...rest } = batch;
      rest.metadata = checksum;
      res.json(rest);
    } else { next(createError(404)); }
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
