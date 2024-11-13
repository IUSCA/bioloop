const express = require('express');
const { body, query, param } = require('express-validator');
const config = require('config');
const _ = require('lodash/fp');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const datasetService = require('../services/dataset');
const workflowService = require('../services/workflow');
const { INCLUDE_DATASET_UPLOAD_LOG_RELATIONS } = require('../constants');

const UPLOAD_PATH = config.upload.path;

const isPermittedTo = accessControl('datasets');

const router = express.Router();
const prisma = new PrismaClient();

const get_dataset_workflows = async ({ dataset } = {}) => {
  const datasetWorkflowIds = dataset.workflows.map((wf) => wf.id);
  const workflowQueryResponse = await workflowService.getAll({
    workflow_ids: datasetWorkflowIds,
  });
  return workflowQueryResponse.data.results;
};

router.get(
  '/',
  validate([
    query('status').isIn(Object.values(config.upload.status)).optional(),
    query('dataset_name').notEmpty().escape().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Retrieve past uploads'

    const {
      status, dataset_name, offset, limit,
    } = req.query;

    const query_obj = {
      where: _.omitBy(_.isUndefined)({
        upload_log: {
          status,
        },
        dataset: {
          name: { contains: dataset_name },
        },
      }),
    };
    const filter_query = {
      skip: offset,
      take: limit,
      ...query_obj,
      orderBy: {
        upload_log: {
          initiated_at: 'desc',
        },
      },
      include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
    };

    const [dataset_upload_logs, count] = await prisma.$transaction([
      prisma.dataset_upload_log.findMany({
        ...filter_query,
      }),
      prisma.dataset_upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
  }),
);

const getUploadedDataProductPath = (datasetId) => path.join(
  UPLOAD_PATH,
  'data_products',
  `${datasetId}`,
  'merged_chunks',
);

// - Create upload logs for the dataset being uploaded and its files.
// - Register the dataset in the system
// - Used by UI
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('name').escape().notEmpty().isLength({ min: 3 }),
    body('source_dataset_id').optional().isInt().toInt(),
    body('files_metadata').isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Create a record for a dataset upload'

    const {
      name, source_dataset_id, files_metadata,
    } = req.body;

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      const created_dataset_upload_log = await tx.dataset_upload_log.create({
        data: {
          dataset: {
            create: {
              ...(source_dataset_id && {
                source_datasets: {
                  create: [{
                    source_id: source_dataset_id,
                  }],
                },
              }),
              name,
              type: 'DATA_PRODUCT',
            },
          },
          upload_log: {
            create: {
              status: config.upload.status.UPLOADING,
              user: {
                connect: {
                  id: req.user.id,
                },
              },
              // type: config.upload.types.DATASET,
              files: {
                create: files_metadata.map((file) => ({
                  name: file.name,
                  md5: file.checksum,
                  num_chunks: file.num_chunks,
                  path: file.path,
                  status: config.upload.status.UPLOADING,
                })),
              },
            },
          },
        },
      });

      const uploadedDatasetId = created_dataset_upload_log.dataset_id;
      await tx.dataset.update({
        where: { id: uploadedDatasetId },
        data: {
          origin_path: getUploadedDataProductPath(uploadedDatasetId),
        },
      });

      const updated_dataset_upload_log = await tx.dataset_upload_log.findUnique({
        where: { id: created_dataset_upload_log.id },
        include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });
      return updated_dataset_upload_log;
    });

    res.json(dataset_upload_log);
  }),
);

// router.get(
//   '/:dataset_id',
//   isPermittedTo('read'),
//   validate([
//     param('dataset_id').isInt().toInt(),
//   ]),
//   asyncHandler(async (req, res, next) => {
//     // #swagger.tags = ['uploads']
//     // #swagger.summary = 'Retrieve an upload log by id'
//
// const dataset_upload_log = await
// prisma.dataset_upload_log.findFirstOrThrow({ where: { dataset_id:
// req.params.dataset_id, }, include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS, });
//
//     res.json(dataset_upload_log);
//   }),
// );

// - Update the upload logs created for an uploaded entity or its files
// - Used by UI, workers
router.patch(
  '/:dataset_id',
  isPermittedTo('update'),
  validate([
    param('dataset_id').isInt().toInt(),
    body('status').notEmpty().escape().optional(),
    body('files').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Update past upload'

    const { status, files = [] } = req.body;
    const update_query = _.omitBy(_.isUndefined)({
      status,
    });

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      let ds_upload_log = await tx.dataset_upload_log.findUniqueOrThrow({
        where: { dataset_id: req.params.dataset_id },
      });
      await tx.upload_log.update({
        where: { id: ds_upload_log.upload_log_id },
        data: update_query,
      });
      // eslint-disable-next-line no-restricted-syntax
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        await tx.file_upload_log.update({
          where: { id: f.id },
          data: f.data,
        });
      }
      ds_upload_log = await tx.dataset_upload_log.findUniqueOrThrow({
        where: { id: ds_upload_log.id },
        include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });
      return ds_upload_log;
    });

    res.json(dataset_upload_log);
  }),
);

// - Initiate the processing of uploaded files
// - Used by workers
router.post(
  '/:dataset_id/process',
  validate([
    param('dataset_id').isInt().toInt(),
  ]),
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Initiate the processing of a completed upload'

    const uploadedDataset = await prisma.dataset.findFirst({
      where: {
        id: req.params.dataset_id,
      },
      include: {
        workflows: true,
        dataset_upload_log: true,
      },
    });

    uploadedDataset.workflows = await get_dataset_workflows({ dataset: uploadedDataset });

    const workflow = await datasetService.create_workflow(
      uploadedDataset,
      'process_dataset_upload',
      req.user.id,
    );
    res.json(workflow);
  }),
);

router.post(
  '/:dataset_id/cancel',
  isPermittedTo('delete'),
  validate([
    param('dataset_id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Cancel a pending upload'

    const cancelUploadWorkflowName = 'cancel_dataset_upload';

    const uploadedDataset = await prisma.dataset.findFirst({
      where: {
        id: req.params.dataset_id,
      },
      include: {
        workflows: true,
        dataset_upload_log: true,
      },
    });

    uploadedDataset.workflows = await get_dataset_workflows({ dataset: uploadedDataset });

    await datasetService.create_workflow(
      uploadedDataset,
      cancelUploadWorkflowName,
      req.user.id,
    );

    res.sendStatus(200);
  }),
);

router.delete(
  '/:dataset_id',
  isPermittedTo('delete'),
  validate([
    param('dataset_id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Delete records of a dataset upload'

    await prisma.$transaction(async (tx) => {
      const uploadedDatasetUploadLog = await tx.dataset_upload_log.findUniqueOrThrow({
        where: {
          dataset_id: req.params.dataset_id,
        },
      });
      // cascade-delete on `upload_log` will delete associated
      // `dataset_upload_log` record and `file_upload_log` records
      await tx.upload_log.delete({
        where: {
          id: uploadedDatasetUploadLog.upload_log_id,
        },
      });
      await tx.dataset.delete({
        where: {
          id: req.params.dataset_id,
        },
      });
    });

    res.sendStatus(200);
  }),
);

module.exports = router;
