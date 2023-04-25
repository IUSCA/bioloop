const fsPromises = require('fs/promises');

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const { query, param, body } = require('express-validator');
const multer = require('multer');
const _ = require('lodash/fp');

// const logger = require('../services/logger');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const batchService = require('../services/batch');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// UI
router.get('/stats', authenticate, asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Batches']
  // #swagger.summary = 'Get summary statistics of batches.'
  const result = await prisma.$queryRaw`select count(*) as "count", sum(du_size) as total_size, sum(num_genome_files) as total_genome_files from batch where is_deleted = false;`;
  const stats = result[0];
  res.json(_.mapValues(Number)(stats));
}));

// worker + UI
router.get(
  '/',
  validate([
    query('only_deleted').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    const batches = await prisma.batch.findMany({
      where: {
        ...(req.query.only_deleted ? { is_deleted: true } : {}),
      },
      include: {
        ...batchService.INCLUDE_WORKFLOWS,
        ...batchService.INCLUDE_STATES,
      },
    });

    res.json(batches);
  }),
);

// worker + UI
router.get(
  '/:id',
  validate([
    param('id').isInt().toInt(),
    query('checksums').toBoolean().default(false),
    query('workflows').toBoolean().default(false),
    query('last_task_run').toBoolean().default(false),
    query('prev_task_runs').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // only select path and md5 columns from the checksum table if checksums is true
    const batch = await batchService.get_batch({
      id: req.params.id,
      checksums: req.query.checksums,
      workflows: req.query.workflows,
      last_task_run: req.query.last_task_run,
      prev_task_runs: req.query.prev_task_runs,
    });
    if (batch) {
      res.json(batch);
    } else {
      next(createError(404));
    }
  }),
);

// worker
router.post(
  '/',
  validate([
    body('du_size').optional().notEmpty().customSanitizer(BigInt), // convert to BigInt
    body('size').optional().notEmpty().customSanitizer(BigInt),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // #swagger.summary = 'Create a new batch.'
    /* #swagger.description = 'workflow_id is optional. If the request body has workflow_id,
        a new relation is created between batch and given workflow_id'
    */
    const { workflow_id, state, ...batch_obj } = req.body;
    const data = batch_obj;
    if (workflow_id) {
      data.workflows = {
        create: [
          {
            id: workflow_id,
          },
        ],
      };
    }
    data.states = {
      create: [
        {
          state: state || 'REGISTERED',
        },
      ],
    };
    const batch = await prisma.batch.create({
      data,
      include: {
        ...batchService.INCLUDE_WORKFLOWS,
        ...batchService.INCLUDE_STATES,
      },
    });
    res.json(batch);
  }),
);

// worker
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
    // #swagger.summary = 'Modify batch.'
    /* #swagger.description =
        To add checksums use POST "/batches/:id/checksums"
        To add workflow use POST "/batches/:id/workflows"
        To add state use POST "/batches/:id/state"
    */
    const batchToUpdate = await prisma.batch.findFirst({
      where: {
        id: req.params.id,
      },
    });
    if (!batchToUpdate) { return next(createError(404)); }

    // const { state, ...data } = req.body;
    // if (state) {
    //   data.states = {
    //     create: [
    //       {
    //         state,
    //       },
    //     ],
    //   };
    // }

    const batch = await prisma.batch.update({
      where: {
        id: req.params.id,
      },
      data: req.body,
      include: {
        ...batchService.INCLUDE_WORKFLOWS,
        ...batchService.INCLUDE_STATES,
      },
    });
    res.json(batch);
  }),
);

// worker
router.post(
  '/:id/checksums',
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // #swagger.summary = Associate checksums to a batch
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

router.post(
  '/:id/workflows',
  authenticate,
  validate([
    param('id').isInt().toInt(),
    body('workflow_id').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // #swagger.summary = Associate workflow_id to a batch
    await prisma.workflow.create({
      data: {
        id: req.body.workflow_id,
        batch_id: req.params.id,
      },
    });
    res.sendStatus(200);
  }),
);

router.post(
  '/:id/state',
  validate([
    param('id').isInt().toInt(),
    body('state').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // #swagger.summary = Add new state to a batch
    await prisma.batch_state.create({
      data: {
        state: req.body.state,
        batch_id: req.params.id,
        metadata: req.body.metadata,
      },
    });
    res.sendStatus(200);
  }),
);

// UI
router.delete(
  '/:id',
  authenticate,
  validate([
    param('id').isInt().toInt(),
    query('soft_delete').toBoolean().default(true),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // #swagger.summary = For soft delete, starts a delete archive workflow and
    // marks the batch as deleted on success. Batch is hard deleted only when there are no
    // workflow association
    const _batch = await batchService.get_batch({
      id: req.params.id,
    });

    if (_batch) {
      if (req.query.soft_delete) {
        await batchService.soft_delete(req.params.id, req.user?.id);
        res.send();
      } else if ((_batch.workflows?.length || 0) === 0) {
        // no workflows - safe to delete
        await batchService.hard_delete(_batch.id);
      } else {
        next(createError.Conflict('Unable to delete as one or more workflows are associated with this bacth'));
      }
    } else {
      next(createError(404));
    }
  }),
);

// UI
router.post(
  '/:id/workflow/:wf',
  authenticate,
  validate([
    param('id').isInt().toInt(),
    param('wf').isIn(['stage', 'integrated']),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // #swagger.summary = Create and start a workflow and associate it.
    // Allowed names are stage, integrated
    const batch_id = req.params.id;
    const wf_name = req.params.wf;
    const wf = (await batchService.create_workflow(wf_name)(batch_id)).data;
    await prisma.workflow.create({
      data: {
        id: wf.workflow_id,
        batch_id,
      },
    });
    return res.json(wf);
  }),
);

const report_storage = multer.diskStorage({
  async destination(req, file, cb) {
    try {
      const batch = await prisma.batch.findFirst({
        where: {
          id: req.params.id,
        },
      });

      if (batch?.report_id) {
        const parent_dir = `reports/${batch.report_id}`;
        await fsPromises.mkdir(parent_dir, {
          recursive: true,
        });

        cb(null, parent_dir);
      } else {
        cb('report_id is not set');
      }
    } catch (e) {
      cb(e);
    }
  },

  filename(req, file, cb) {
    cb(null, 'multiqc_report.html');
  },
});

// worker
router.put(
  '/:id/report',
  validate([
    param('id').isInt().toInt(),
  ]),
  multer({ storage: report_storage }).single('report'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Batches']
    // #swagger.summary = Upload a QC report (html file) of this batch
    res.json({
      path: req.file.path,
    });
  }),
);

module.exports = router;
