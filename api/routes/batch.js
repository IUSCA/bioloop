const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const { query, param, body } = require('express-validator');

// const logger = require('../services/logger');
// const asyncHandler = require('../middleware/asyncHandler');
const validator = require('../middleware/validator');
const { includeWorkflow } = require('../services/workflow');
const { renameKey } = require('../utils');

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
        metadata: checksumSelect,
      },
    });

    // include workflow with batch
    const _includeWorkflow = includeWorkflow();
    const promises = batches.map(_includeWorkflow);
    const result = await Promise.all(promises);
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
        metadata: checksumSelect,
      },
    });
    if (batch) {
      // include workflow with batch
      const _includeWorkflow = includeWorkflow(true, true);
      _batch = await _includeWorkflow(batch);
      res.json(_batch);
    } else {
      next(createError(404));
    }
  }),
);

router.post(
  '/',
  body('du_size').optional().notEmpty().customSanitizer(BigInt), // convert to BigInt
  body('size').optional().notEmpty().customSanitizer(BigInt),
  validator(async (req, res, next) => {
    const batch = await prisma.batch.create({
      data: req.body,
    });

    res.json(batch);
  }),
);

router.patch(
  '/:id',
  param('id').isInt().toInt(),
  body('du_size').optional().notEmpty().bail()
    .customSanitizer(BigInt), // convert to BigInt
  body('size').optional().notEmpty().bail()
    .customSanitizer(BigInt),
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
