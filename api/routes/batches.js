const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const { query, param, body } = require('express-validator');

// const logger = require('../services/logger');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const wfService = require('../services/workflow');

const router = express.Router();
const prisma = new PrismaClient();

router.get(
  '/',
  validate([
    query('include_checksums').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
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
    const _includeWorkflow = wfService.includeWorkflow();
    const promises = batches.map(_includeWorkflow);
    const result = await Promise.all(promises);
    res.json(result);
  }),
);

router.get(
  '/:id',
  validate([
    param('id').isInt().toInt(),
    query('include_checksums').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
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
      const _includeWorkflow = wfService.includeWorkflow(true, true);
      const _batch = await _includeWorkflow(batch);
      res.json(_batch);
    } else {
      next(createError(404));
    }
  }),
);

router.post(
  '/',
  validate([
    body('du_size').optional().notEmpty().customSanitizer(BigInt), // convert to BigInt
    body('size').optional().notEmpty().customSanitizer(BigInt),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    const batch = await prisma.batch.create({
      data: req.body,
    });

    res.json(batch);
  }),
);

router.patch(
  '/:id',
  validate([
    param('id').isInt().toInt(),
    body('du_size').optional().notEmpty().bail()
      .customSanitizer(BigInt), // convert to BigInt
    body('size').optional().notEmpty().bail()
      .customSanitizer(BigInt),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
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
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
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

router.delete(
  '/:id',
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const deleteChecksums = prisma.checksum.deleteMany({
      where: {
        batch_id: req.params.id,
      },
    });
    const deleteBatch = prisma.batch.delete({
      where: {
        id: req.params.id,
      },
    });

    await prisma.$transaction([deleteChecksums, deleteBatch]);
    res.send();
  }),
);

router.post(
  '/:id/stage',
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const batch_id = req.params.id;
    const wf = await wfService.create({
      name: 'Re-stage Batch',
      steps: [{}, {}, {}],
      args: [batch_id],
    });
    return res.json(wf);
  }),
);

module.exports = router;
