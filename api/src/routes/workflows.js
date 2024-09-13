const express = require('express');
const { PrismaClient } = require('@prisma/client');
const config = require('config');
const { query, param, checkSchema } = require('express-validator');
const _ = require('lodash/fp');

const asyncHandler = require('../middleware/asyncHandler');
const wf_service = require('../services/workflow');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');

const isPermittedTo = accessControl('workflow');

const router = express.Router();
const prisma = new PrismaClient();

const build_query = async (req) => {
  const workflow_ids = req.query.workflow_id;
  const filter_results = (Array.isArray(workflow_ids) && (workflow_ids || []).length > 0)
        || (typeof workflow_ids === 'string' && workflow_ids.trim() !== '')
        || req.query.dataset_id
        || req.query.dataset_name;

  let query_by_wf_ids;
  let app_workflows;

  if (filter_results) {
    let filter_query = {};
    if (Array.isArray(workflow_ids) && (workflow_ids || []).length > 0) {
      filter_query = {
        id: {
          in: workflow_ids,
        },
      };
    } else if (typeof workflow_ids === 'string' && workflow_ids.trim() !== '') {
      filter_query = {
        id: {
          equals: workflow_ids,
        },
      };
    } else if (req.query.dataset_id) {
      filter_query = {
        dataset_id: {
          equals: Number(req.query.dataset_id),
        },
      };
    } else if (req.query.dataset_name) {
      filter_query = {
        dataset: {
          name: {
            contains: req.query.dataset_name,
          },
        },
      };
    }

    app_workflows = await prisma.workflow.findMany({
      where: { ...filter_query },
      include: {
        initiator: true,
      },
    });

    query_by_wf_ids = (app_workflows || []).map((wf) => wf.id);
  } else {
    query_by_wf_ids = null;
  }

  return query_by_wf_ids;
};

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      const query_by_wf_ids = build_query(req);

      const api_res = await wf_service.getAll({
        last_task_run: req.query.last_task_run,
        prev_task_runs: req.query.prev_task_runs,
        status: req.query.status,
        app_id: config.app_id,
        skip: req.query.skip,
        limit: req.query.limit,
        workflow_ids: query_by_wf_ids,
      });

      const nosql_workflows = api_res.data.results;

      const results = (query_by_wf_ids || []).length > 0 ? (nosql_workflows || []).map((wf) => {
        const app_wf = (query_by_wf_ids || []).find((wf_id) => wf_id === wf.id);
        return {
          ...wf,
          ...app_wf,
        };
      }) : nosql_workflows;

      res.json({
        metadata: api_res.data.metadata,
        results,
      });
    },
  ),
);

router.get(
  '/current',
  isPermittedTo('read'),
  asyncHandler(
    async (req, res, next) => {
      const workflows = await prisma.workflow.findMany();
      res.json(workflows);
    },
  ),
);

router.get(
  '/counts_by_status',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const counts = await wf_service.getCountsByStatus({ app_id: config.app_id });
    res.json(counts.data);
  }),
);

function sanitize_timestamp(t) {
  if (typeof (t) === 'string') {
    const d = new Date(t);
    // eslint-disable-next-line no-restricted-globals
    if (!isNaN(d)) return d;
  }
}

const log_process_schema = {
  workflow_id: { notEmpty: true },
  pid: { notEmpty: true, isInt: true, toInt: true },
  task_id: { notEmpty: true },
  step: { notEmpty: true },
  hostname: { notEmpty: true },
};
router.post(
  '/processes',
  isPermittedTo('update'),
  validate([checkSchema(log_process_schema)]),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = register a process to send logs
      const {
        pid, task_id, step, tags, hostname, workflow_id,
      } = req.body;
      const start_time = sanitize_timestamp(req.body.start_time);
      const log_process = await prisma.worker_process.create({
        data: {
          pid,
          task_id,
          step,
          tags,
          hostname,
          workflow_id,
          ...(start_time ? { start_time } : {}),
        },
      });
      res.json(log_process);
    },
  ),
);

// make sure that the request body is array of objects which at least will have a "message" key
const append_log_schema = {
  '0.message': {
    in: ['body'],
    notEmpty: true,
  },
  '0.level': {
    in: ['body'],
    default: 'stdout',
  },
};
router.post(
  '/processes/:process_id/logs',
  isPermittedTo('update'),
  validate([
    param('process_id').isInt().toInt(),
    checkSchema(append_log_schema),
  ]),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = publish logs of a worker process
      const data = req.body.map((log) => {
        const {
          timestamp, message, level,
        } = log;

        return {
          timestamp: sanitize_timestamp(timestamp),
          message,
          level,
          worker_process_id: req.params.process_id,
        };
      });

      const result = await prisma.log.createMany({
        data,
      });
      res.json(result);
    },
  ),
);

router.get(
  '/processes',
  isPermittedTo('read'),
  validate([query('pid').isInt().toInt().optional()]),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = get processes

      const filters = _.flow([
        _.pick(['step', 'task_id', 'pid', 'workflow_id']),
        _.omitBy(_.isNil),
      ])(req.query);

      const processes = await prisma.worker_process.findMany({
        where: {
          ...filters,
        },
        orderBy: {
          start_time: 'asc',
        },
      });
      res.json(processes);
    },
  ),
);

router.get(
  '/processes/:process_id/logs',
  isPermittedTo('read'),
  validate([
    param('process_id').isInt().toInt(),
    query('before_id').isInt().toInt().optional(),
    query('after_id').isInt().toInt().optional(),
  ]),
  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = get logs of a worker process

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

      const rows = await prisma.log.findMany({
        where: {
          worker_process_id: req.params.process_id,
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

router.delete(
  '/:workflow_id/processes',
  isPermittedTo('delete'),

  asyncHandler(
    async (req, res, next) => {
      // #swagger.tags = ['Workflow']
      // #swagger.summary = delete all processes, its logs registered under a workflow

      const result = await prisma.worker_process.deleteMany({
        where: {
          workflow_id: req.params.worker_process_id,
        },
      });
      res.json(result);
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
module.exports = router;
