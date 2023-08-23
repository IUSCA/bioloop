const express = require('express');
const { PrismaClient } = require('@prisma/client');
const config = require('config');
const { query, checkSchema } = require('express-validator');
const _ = require('lodash/fp');

const asyncHandler = require('../middleware/asyncHandler');
const wf_service = require('../services/workflow');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');

const isPermittedTo = accessControl('workflow');

const router = express.Router();
const prisma = new PrismaClient();

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      const api_res = await wf_service.getAll({
        last_task_run: req.query.last_task_run,
        prev_task_runs: req.query.prev_task_runs,
        only_active: req.query.only_active,
        app_id: config.app_id,
        skip: req.query.skip,
        limit: req.query.limit,
        workflow_ids: req.query.workflow_id,
      });
      res.json(api_res.data);
    },
  ),
);

router.get(
  '/:id',
  isPermittedTo('read'),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      const api_res = await wf_service.getOne(
        req.params.id,
        req.query.last_task_runs,
        req.query.prev_task_runs,
      );
      res.json(api_res.data);
    },
  ),
);

router.post(
  '/:id/pause',
  isPermittedTo('update'),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      const api_res = await wf_service.pause(req.params.id);
      res.json(api_res.data);
    },
  ),
);

router.post(
  '/:id/resume',
  isPermittedTo('update'),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      const api_res = await wf_service.resume(req.params.id);
      res.json(api_res.data);
    },
  ),
);

router.delete(
  '/:id',
  isPermittedTo('delete'),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = delete workflow and then delete dataset-workflow association
      const api_res = await wf_service.deleteOne(req.params.id);
      await prisma.workflow.delete({
        where: {
          id: req.params.id,
        },
      }).catch((err) => {
        console.warn('Unable to delete workflow from the app database', err);
      });
      res.json(api_res.data);
    },
  ),
);

function sanitize_timestamp(t) {
  if (typeof (t) === 'string') {
    const d = new Date(t);
    // eslint-disable-next-line no-restricted-globals
    if (!isNaN(d)) return d;
  }
}

// make sure that the request body is array of objects which at least will have a "message" key
const append_log_schema = {
  '0.message': {
    in: ['body'],
  },
};
router.post(
  '/:id/logs',
  isPermittedTo('update'),
  validate([checkSchema(append_log_schema)]),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = publish logs of a worker process
      const data = req.body.map((log) => {
        const {
          timestamp, message, level, pid, task_id, step, tags,
        } = log;

        return {
          timestamp: sanitize_timestamp(timestamp),
          message,
          level,
          pid,
          task_id,
          step,
          tags,
          workflow_id: req.params.id,
        };
      });

      const result = await prisma.worker_log.createMany({
        data,
      });
      res.json(result);
    },
  ),
);

router.get(
  '/:id/logs',
  isPermittedTo('read'),
  validate([
    query('before_id').isInt().toInt().optional(),
    query('after_id').isInt().toInt().optional(),
    query('pid').isInt().toInt().optional(),
  ]),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = get logs of a worker process

      const filters = _.flow([
        _.pick(['level', 'pid', 'step', 'task_id']),
        _.omitBy(_.isNil),
      ])(req.query);

      let id_ordinal_filter = {};
      if (req.query.before_id && req.query.after_id) {
        id_ordinal_filter = {
          AND: [
            {
              id: {
                lt: req.query.before_id,
              },
            },
            {
              id: {
                gt: req.query.after_id,
              },
            },
          ],
        };
      } else if (req.query.before_id) {
        id_ordinal_filter = {
          id: {
            lt: req.query.before_id,
          },
        };
      } else if (req.query.after_id) {
        id_ordinal_filter = {
          id: {
            gt: req.query.after_id,
          },
        };
      }

      const rows = await prisma.worker_log.findMany({
        where: {
          workflow_id: req.params.id,
          ...filters,
          ...id_ordinal_filter,
        },
        orderBy: {
          id: 'asc',
        },
      });

      res.json(rows);
    },
  ),
);
module.exports = router;
