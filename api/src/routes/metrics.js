const express = require('express');
const { PrismaClient } = require('@prisma/client');

const asyncHandler = require('../middleware/asyncHandler');
const { numericStringsToNumbers } = require('../utils');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('metrics');
const router = express.Router();
const prisma = new PrismaClient();

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
  '/space-utilization-by-timestamp-and-measurement',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const metrics = await prisma.$queryRaw`
      select
        timestamp::DATE as date,
        measurement,
        sum(usage) as total_usage,
        "limit"
      from metric
      group by
        timestamp::DATE,
        measurement,
        "limit"
      order by 
        timestamp::DATE asc,
        measurement asc
  `;

    // convert numeric strs to numbers
    res.json(numericStringsToNumbers(
      metrics,
      ['total_usage', 'limit'],
    ));
  }),
);

router.get(
  '/space-utilization-totals-by-measurement',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const metrics = await prisma.$queryRaw`
      select
        measurement,
        sum(usage) as total_usage
      from metric
      group by
        measurement
      order by 
        measurement asc
  `;

    // convert numeric strs to numbers
    res.json(numericStringsToNumbers(metrics, ['total_usage']));
  }),
);

router.post('/', asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Metrics']
  // #swagger.summary = 'Insert new measurements'
  const result = await prisma.metric.createMany({
    data: req.body,
  });
  res.json(result);
}));

module.exports = router;
