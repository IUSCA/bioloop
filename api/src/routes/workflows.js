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

// const nosql_workflows = {
//   metadata: {
//     total: 1499,
//     limit: 10,
//     skip: 0,
//   },
//   results: [
//     {
//       id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
//       name: 'integrated',
//       app_id: 'bioloop-dev.sca.iu.edu',
//       description: null,
//       created_at: '2024-09-07T02:33:52.955000Z',
//       updated_at: '2024-09-07T02:39:19.109000Z',
//       status: 'SUCCESS',
//       steps_done: 6,
//       total_steps: 6,
//       steps: [
//         {
//           name: 'await stability',
//           task: 'await_stability',
//           status: 'SUCCESS',
//           last_task_run: {
//             _id: 'f38c8472-1757-47e2-81d2-6061f3b02221',
//             status: 'SUCCESS',
//             result: [
//               42,
//             ],
//             traceback: null,
//             children: [],
//             date_done: '2024-09-07T02:38:53.408917Z',
//             name: 'await_stability',
//             args: [
//               42,
//             ],
//             kwargs: {
//               workflow_id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
//               step: 'await stability',
//               app_id: 'bioloop-dev.sca.iu.edu',
//             },
//             worker: 'bioloop-dev-celery-w1@colo25.carbonate.uits.iu.edu',
//             retries: 0,
//             queue: 'bioloop-dev.sca.iu.edu.q',
//             date_start: '2024-09-07T02:33:53.102000Z',
//           },
//         },
//         {
//           name: 'inspect',
//           task: 'inspect_dataset',
//           status: 'SUCCESS',
//           last_task_run: {
//             _id: '19552e36-77d5-4772-abaf-37d68054e427',
//             status: 'SUCCESS',
//             result: [
//               42,
//             ],
//             traceback: null,
//             children: [],
//             date_done: '2024-09-07T02:38:56.523910Z',
//             parent_id: 'f38c8472-1757-47e2-81d2-6061f3b02221',
//             name: 'inspect_dataset',
//             args: [
//               42,
//             ],
//             kwargs: {
//               workflow_id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
//               step: 'inspect',
//               app_id: 'bioloop-dev.sca.iu.edu',
//             },
//             worker: 'bioloop-dev-celery-w1@colo25.carbonate.uits.iu.edu',
//             retries: 0,
//             queue: 'bioloop-dev.sca.iu.edu.q',
//             date_start: '2024-09-07T02:38:53.519000Z',
//           },
//         },
//         {
//           name: 'archive',
//           task: 'archive_dataset',
//           status: 'SUCCESS',
//           last_task_run: {
//             _id: 'fd33e478-5749-4609-9d10-7de25643ceac',
//             status: 'SUCCESS',
//             result: [
//               42,
//             ],
//             traceback: null,
//             children: [],
//             date_done: '2024-09-07T02:39:05.426538Z',
//             parent_id: '19552e36-77d5-4772-abaf-37d68054e427',
//             name: 'archive_dataset',
//             args: [
//               42,
//             ],
//             kwargs: {
//               workflow_id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
//               step: 'archive',
//               app_id: 'bioloop-dev.sca.iu.edu',
//             },
//             worker: 'bioloop-dev-celery-w1@colo25.carbonate.uits.iu.edu',
//             retries: 0,
//             queue: 'bioloop-dev.sca.iu.edu.q',
//             date_start: '2024-09-07T02:38:56.636000Z',
//           },
//         },
//         {
//           name: 'stage',
//           task: 'stage_dataset',
//           status: 'SUCCESS',
//           last_task_run: {
//             _id: '457a23aa-8c30-4bf0-979a-0cad68cb948d',
//             status: 'SUCCESS',
//             result: [
//               42,
//             ],
//             traceback: null,
//             children: [],
//             date_done: '2024-09-07T02:39:15.469600Z',
//             parent_id: 'fd33e478-5749-4609-9d10-7de25643ceac',
//             name: 'stage_dataset',
//             args: [
//               42,
//             ],
//             kwargs: {
//               workflow_id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
//               step: 'stage',
//               app_id: 'bioloop-dev.sca.iu.edu',
//             },
//             worker: 'bioloop-dev-celery-w1@colo25.carbonate.uits.iu.edu',
//             retries: 0,
//             queue: 'bioloop-dev.sca.iu.edu.q',
//             date_start: '2024-09-07T02:39:05.541000Z',
//           },
//         },
//         {
//           name: 'validate',
//           task: 'validate_dataset',
//           status: 'SUCCESS',
//           last_task_run: {
//             _id: '6526de42-f60e-4499-bbcd-acf5d8078c87',
//             status: 'SUCCESS',
//             result: [
//               42,
//               [],
//             ],
//             traceback: null,
//             children: [],
//             date_done: '2024-09-07T02:39:18.721248Z',
//             parent_id: '457a23aa-8c30-4bf0-979a-0cad68cb948d',
//             name: 'validate_dataset',
//             args: [
//               42,
//             ],
//             kwargs: {
//               workflow_id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
//               step: 'validate',
//               app_id: 'bioloop-dev.sca.iu.edu',
//             },
//             worker: 'bioloop-dev-celery-w1@colo25.carbonate.uits.iu.edu',
//             retries: 0,
//             queue: 'bioloop-dev.sca.iu.edu.q',
//             date_start: '2024-09-07T02:39:15.722000Z',
//           },
//         },
//         {
//           name: 'setup_download',
//           task: 'setup_dataset_download',
//           status: 'SUCCESS',
//           last_task_run: {
//             _id: 'b16f2f6c-20d9-426f-8433-44fd26389b5b',
//             status: 'SUCCESS',
//             result: [
//               42,
//             ],
//             traceback: null,
//             children: [],
//             date_done: '2024-09-07T02:39:19.098031Z',
//             parent_id: '6526de42-f60e-4499-bbcd-acf5d8078c87',
//             name: 'setup_dataset_download',
//             args: [
//               42,
//             ],
//             kwargs: {
//               workflow_id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
//               step: 'setup_download',
//               app_id: 'bioloop-dev.sca.iu.edu',
//             },
//             worker: 'bioloop-dev-celery-w1@colo25.carbonate.uits.iu.edu',
//             retries: 0,
//             queue: 'bioloop-dev.sca.iu.edu.q',
//             date_start: '2024-09-07T02:39:18.904000Z',
//           },
//         },
//       ],
//       resume_lock: null,
//     }],
// };

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(
    async (req, res, next) => {
      // // #swagger.tags = ['Workflow']
      const api_res = await wf_service.getAll({
        last_task_run: req.query.last_task_run,
        prev_task_runs: req.query.prev_task_runs,
        status: req.query.status,
        app_id: config.app_id,
        skip: req.query.skip,
        limit: req.query.limit,
        workflow_ids: req.query.workflow_id,
      });
      //
      // // res.json(api_res.data);
      //
      // const app_workflows = [{
      //   id: 'c0bbac2b-2b95-4575-b6be-28d86492cde2',
      //   initiator_id: 58,
      //   initiator: {
      //     name: 'Rishi Pandey',
      //     username: 'ripandey',
      //   },
      //   dataset_id: 42,
      // }];

      console.log('query dataset_id: ', req.query.dataset_id);
      console.log('workflows_ids:', req.query.workflow_id);

      const nosql_workflows = api_res.data;

      let filter_query = {};
      if (req.query.workflow_id) {
        filter_query = {
          id: {
            equals: req.query.workflow_id,
          },
        };
      } else if (req.query.dataset_id) {
        filter_query = {
          dataset_id: {
            equals: req.query.dataset_id,
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

      const app_workflows = await prisma.workflow.findMany({
        where: { ...filter_query },
        include: {
          initiator: true,
        },
      });
      const app_workflows_ids = (app_workflows || []).map((wf) => wf.id);

      console.log('app_workflows:');
      console.dir(app_workflows, { depth: null });

      const filtered_nosql_workflows = app_workflows_ids.length > 0
        ? (nosql_workflows.results || []).filter((wf) => app_workflows_ids.includes(wf._id))
        : nosql_workflows.results;

      const results = (filtered_nosql_workflows.results || []).map((wf) => {
        const app_wf = (app_workflows || []).find((aw) => aw.id === wf._id);
        return {
          ...wf,
          ...app_wf,
        };
      });

      // res.json({
      //   metadata: nosql_workflows.metadata,
      //   results,
      // });

      res.json({
        metadata: {
          total: nosql_workflows.results.length,
          limit: req.query.limit,
          skip: req.query.skip,
        },
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
