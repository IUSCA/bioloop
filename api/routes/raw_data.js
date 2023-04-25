const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const { query, param } = require('express-validator');
const _ = require('lodash/fp');

const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const batchService = require('../services/batch');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/stats', asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Raw Data']
  // #swagger.summary = 'Get summary statistics of batches of raw data.'
  const result = await prisma.$queryRaw`
  select count(*)                      as "count",
         sum(du_size)                  as total_size,
         sum(num_genome_files)         as genome_files
  from batch
  join raw_data rd on batch.id = rd.batch_id
  where is_deleted = false`;
  const stats = _.mapValues(Number)(result[0]);

  const result_2 = await prisma.$queryRaw`
  select sum(1) as workflows
  from batch
  join raw_data rd on batch.id = rd.batch_id
  join workflow w on batch.id = w.batch_id
  where is_deleted = false
  `;

  res.json({
    ...stats,
    ..._.mapValues(Number)(result_2[0]),
  });
}));

router.get(
  '/',
  validate([
    query('only_deleted').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Raw Data']
    const objs = await prisma.raw_data.findMany({
      where: {
        batch: {
          ...(req.query.only_deleted ? { is_deleted: true } : {}),
        },
      },
      include: {
        batch: {
          include: {
            ...batchService.include_workflows,
            ...batchService.include_states,
          },
        },
      },
    });
    res.json(objs);
  }),
);

router.get(
  '/:id',
  validate([
    param('id').isInt().toInt(),
    query('workflows').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Raw Data']
    // only select path and md5 columns from the checksum table if checksums is true
    const _batch = await batchService.get_batch({
      raw_data_id: req.params.id,
      workflows: req.query.workflows,
    });
    if (_batch) {
      // eslint-disable-next-line no-unused-vars
      const { raw_data, data_product, ...batch } = _batch;
      res.json({
        ..._.omit(['batch_id'])(raw_data),
        batch,
      });
    } else {
      next(createError(404));
    }
  }),
);

router.get('/:id');

module.exports = router;
