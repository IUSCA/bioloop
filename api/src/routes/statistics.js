// const { date_minus_months } = require('../utils');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const dayjs = require('dayjs');
const { query } = require('express-validator');

const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { groupByAndAggregate, numericStringsToNumbers } = require('../utils');

const isPermittedTo = accessControl('statistics');
const router = express.Router();
const prisma = new PrismaClient();

// Retrieves the starting and ending extremes of the date range across which any files or datasets
// have been accessed.
router.get(
  '/data-access-timestamp-range',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const dates = await prisma.$queryRaw`
    SELECT 
      MAX(timestamp) AS max_timestamp,
      MIN(timestamp) AS min_timestamp
    FROM
      DATA_ACCESS_LOG;
    `;
    res.json(dates);
  }),
);

/**
 * Retrieves the count of data access records grouped by date. Results are retrieved across the
 * given range specified through start_date and end_date. If optional param by_access_type
 * is true, results will be grouped by type of data access (browser download vs Slate-Scratch
 * access) as well.
 *
 * Returned results are sorted by timestamp (ascending)
 */
router.get(
  '/data-access-count-by-date',
  isPermittedTo('read'),
  validate([
    query('start_date').isISO8601(),
    query('end_date').isISO8601(),
    query('by_access_type').isBoolean().toBoolean().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    const start_date = dayjs(req.query.start_date).toDate();
    const end_date = dayjs(req.query.end_date).toDate();
    const { by_access_type } = req.query;

    // Retrieve records by including access_type in the GROUP BY clause first, and filter records
    // based on value of by_access_type later. This is because Prisma does not allow including
    // dynamic column names as template variables in raw queries.
    const data_access_counts = await prisma.$queryRaw`
      SELECT
        timestamp::DATE AS date,
        access_type,
        COUNT(*) AS count
      FROM
        data_access_log
      WHERE
        timestamp::DATE >= ${start_date} AND timestamp::DATE <= ${end_date}
      GROUP BY
        timestamp::DATE,
        access_type
      ORDER BY
        timestamp::DATE ASC,
        access_type ASC
    `;

    if (by_access_type) {
      res.json(numericStringsToNumbers(data_access_counts, ['count']));
      return;
    }

    const ret = groupByAndAggregate(
      data_access_counts,
      'date',
      'count',
      (groupedValues) => (groupedValues.length > 1
        ? groupedValues.reduce((accumulator, currentVal) => accumulator.count + currentVal.count)
        : groupedValues[0].count),
      (count) => count.date.toISOString(),
    );

    res.json(numericStringsToNumbers(ret, ['count']));
  }),
);

router.get(
  '/data-access-count-by-access-method',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const data_access_counts = await prisma.$queryRaw`
      SELECT
        access_type as access_type,
        count(*)
      FROM
        data_access_log
      GROUP BY access_type
    `;
    res.json(numericStringsToNumbers(data_access_counts, ['count']));
  }),
);

/**
 * Retrieves the most frequently accessed files (and optionally, datasets). The number of
 * entities retrieved is limited by the limit query param. If include_datasets is provided and is
 * true, access records for datasets (i.e. attempts to access the data directly from Slate-
 * Scratch) will be included in the results.
 *
 * Returned results are sorted by count (descending).
 */
router.get(
  '/most-accessed-data',
  isPermittedTo('read'),
  validate([
    query('limit').isInt().toInt().optional(),
    query('include_datasets').isBoolean().toBoolean().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    const most_accessed_files = await prisma.$queryRaw`
      SELECT
        COUNT(*),
        LOG.FILE_ID,
        LOG.ACCESS_TYPE,
        FILE.NAME,
        FILE.PATH,
        DS.ID AS DATASET_ID,
        DS.NAME AS DATASET_NAME
      FROM
        DATASET_FILE FILE
        INNER JOIN DATASET DS
          ON DS.ID = FILE.DATASET_ID
        INNER JOIN DATA_ACCESS_LOG LOG
          ON FILE.ID = LOG.FILE_ID
        WHERE
          LOG.FILE_ID IS NOT NULL
        GROUP BY
          LOG.FILE_ID,
          LOG.ACCESS_TYPE,
          FILE.NAME,
          FILE.PATH,
          DS.ID,
          DS.NAME
        ORDER BY COUNT DESC
        LIMIT ${req.query.limit}
    `;

    if (!req.query.include_datasets) {
      res.json(numericStringsToNumbers(most_accessed_files, ['count']));
      return;
    }

    const most_accessed_datasets = await prisma.$queryRaw`
      SELECT
        COUNT(*) AS COUNT,
        LOG.DATASET_ID,
        LOG.ACCESS_TYPE,
        DS.NAME
      FROM
        DATA_ACCESS_LOG LOG
        INNER JOIN DATASET DS
          ON LOG.DATASET_ID = DS.ID
      GROUP BY LOG.DATASET_ID, LOG.ACCESS_TYPE, DS.NAME
      ORDER BY COUNT DESC
      LIMIT ${req.query.limit}
    `;

    const most_accessed_data = most_accessed_files
      .concat(most_accessed_datasets)
      .sort((d1, d2) => {
        if (d1.count === d2.count) return 0;
        return d1.count > d2.count ? -1 : 1;
      })
      .slice(0, req.query.limit);

    res.json(numericStringsToNumbers(most_accessed_data, ['count']));
  }),
);

/**
 * Retrieves the count of staging request records grouped by date. Results are retrieved across the
 * given range specified through start_date and end_date.
 *
 * Returned results are sorted by timestamp (descending).
 */
router.get(
  '/stage-request-count-by-date',
  isPermittedTo('read'),
  validate([
    query('start_date').isISO8601(),
    query('end_date').isISO8601(),
  ]),
  asyncHandler(async (req, res, next) => {
    const start_date = dayjs(req.query.start_date).toDate();
    const end_date = dayjs(req.query.end_date).toDate();

    const stage_request_counts = await prisma.$queryRaw`
      SELECT
        timestamp::DATE AS date,
        COUNT(*) AS count
      FROM
        stage_request_log
      WHERE
        timestamp::DATE >= ${start_date} AND timestamp::DATE <= ${end_date}
      GROUP BY
        timestamp::DATE
      ORDER BY
        timestamp::DATE ASC
    `;

    res.json(numericStringsToNumbers(stage_request_counts, ['count']));
  }),
);

/**
 * Retrieves the most frequently staged datasets. The number of datasets retrieved is limited by
 * the limit query param
 *
 * Returned results are sorted by count (descending).
 */
router.get(
  '/most-staged-datasets',
  isPermittedTo('read'),
  validate([
    query('limit').isInt().toInt().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    const most_staged_datasets = await prisma.$queryRaw`
      SELECT
        d.id AS dataset_id,
        d.name AS dataset_name,
        count(*) AS count
      FROM
        dataset_state s INNER JOIN dataset d
          ON
            s.dataset_id = d.id
      GROUP BY
        d.id,
        d.name
      ORDER BY count DESC
      LIMIT ${req.query.limit} 
    `;

    res.send(numericStringsToNumbers(most_staged_datasets, ['count']));
  }),
);

// Retrieves the starting and ending extremes of the date range across which staging
// has been attempted on any datasets
router.get(
  '/stage-request-timestamp-range',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const dates = await prisma.$queryRaw`
    SELECT 
      MAX(timestamp) AS max_timestamp,
      MIN(timestamp) AS min_timestamp
    FROM
      STAGE_REQUEST_LOG;
    `;
    res.json(dates);
  }),
);

/**
 * Returns the count of registered users grouped by date. Returned results are sorted by date
 * (ascending).
 */
router.get(
  '/user-count',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const user_counts_by_date = await prisma.$queryRaw`
    select
      u.created_at::DATE,
      count(*) as count,
      sum(count(*)) over (order by u.created_at::DATE asc) as cumulative_sum
    from
      "user" u
    group by u.created_at::DATE
    order by 
      u.created_at::DATE asc
  `;
    res.json(numericStringsToNumbers(user_counts_by_date, ['count', 'cumulative_sum']));
  }),
);

/**
 * Returns users consuming maximum bandwidth, limited by the limit param. Returned results are
 * sorted by bandwidth consumed (descending).
*/
router.get(
  '/users-by-bandwidth',
  isPermittedTo('read'),
  validate([
    query('limit').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const users_by_bandwidth = await prisma.$queryRaw`
      select 
        l.user_id,
        u.username,
        u.name,
        sum(f.size) + sum(d.size) as bandwidth
      from
        data_access_log l 
        left join dataset_file f on l.file_id = f.id
        left join dataset d on l.dataset_id = d.id
        inner join "user" u on l.user_id = u.id
      group by
        l.user_id,
        u.username,
        u.name
      order by bandwidth desc
      limit ${req.query.limit}
    `;
    res.json(numericStringsToNumbers(users_by_bandwidth, ['bandwidth']));
  }),
);

// Persists a data access record to the data_access_log table
router.post(
  '/data-access-log',
  isPermittedTo('create'),
  validate([
    query('access_type').notEmpty().escape(),
    query('file_id').isInt().toInt().optional(),
    query('dataset_id').isInt().toInt().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    await prisma.data_access_log.create({
      data: {
        access_type: req.query.access_type,
        file_id: req.query.file_id,
        dataset_id: req.query.dataset_id,
        user_id: req.user.id,
      },
    });

    res.send('Data Access logged successfully!');
  }),
);

module.exports = router;
