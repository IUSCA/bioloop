const express = require('express');
const he = require('he');
const { query } = require('express-validator');

const asyncHandler = require('@/middleware/asyncHandler');
const { numericStringsToNumbers } = require('@/utils');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');
const prisma = require('@/db');

const isPermittedTo = accessControl('metrics');
const router = express.Router();

router.get('/latest', asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Metrics']
  // #swagger.summary = 'Get latest entries for each measurement.'
  const latestEntries = await prisma.$queryRaw`
    select distinct on (measurement, subject) timestamp, measurement, subject, usage, "limit", fields, tags
    from metric
    order by measurement, subject, timestamp desc;
  `;

  res.json(latestEntries);
}));

router.get(
  '/space-utilization-by-timestamp',
  isPermittedTo('read'),
  validate([
    query('measurement').notEmpty().escape(),
  ]),
  asyncHandler(async (req, res, next) => {
    const measurement = decodeURI(he.decode(req.query.measurement));

    const metrics = await prisma.$queryRaw`
      select
        usage, "limit", timestamp
      from
        metric
      where
        measurement=${measurement}
      group by timestamp, usage, "limit"
      order by timestamp desc
  `;

    // convert numeric strings to numbers
    res.json(numericStringsToNumbers(
      metrics,
      ['usage', 'limit'],
    ));
  }),
);

router.post(
  '/',
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Metrics']
  // #swagger.summary = 'Insert new measurements'
    const result = await prisma.metric.createMany({
      data: req.body,
    });
    res.json(result);
  }),
);

module.exports = router;
