const express = require('express');
const { body, query, param } = require('express-validator');
const config = require('config');
const _ = require('lodash/fp');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const authService = require('../services/auth');
const datasetService = require('../services/dataset');
const { INCLUDE_DATASET_UPLOAD_LOG_RELATIONS } = require('../constants');

const UPLOAD_PATH = config.upload.path;

const isPermittedTo = accessControl('upload');

const router = express.Router();
const prisma = new PrismaClient();

router.post(
  '/token',
  isPermittedTo('create'),
  validate([
    body('file_name').notEmpty().escape(),
  ]),
  asyncHandler(async (req, res) => {
    let token;
    try {
      token = await authService.get_upload_token(req.body.file_name);
    } catch (e) {
      console.error(e);
    }
    res.json(token);
  }),
);

router.get(
  '/',
  validate([
    query('status').isIn(Object.values(config.upload.status)).optional(),
    query('upload_type').isIn(Object.values(Object.values(config.upload.types))).optional(),
    query('entity_name').notEmpty().escape().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Retrieve past uploads'

    const {
      status, upload_type, entity_name, offset, limit,
    } = req.query;

    const isDatasetUpload = upload_type === config.upload.types.DATASET;

    const nameFilter = isDatasetUpload ? {
      dataset_upload: {
        dataset: {
          name: { contains: entity_name },
        },
      },
    } : null;

    const query_obj = {
      where: _.omitBy(_.isUndefined)({
        status,
        ...nameFilter,
      }),
    };
    const filter_query = {
      skip: offset,
      take: limit,
      ...query_obj,
      include: isDatasetUpload ? INCLUDE_DATASET_UPLOAD_LOG_RELATIONS : null,
    };

    const [upload_logs, count] = await prisma.$transaction([
      prisma.upload_log.findMany({
        ...filter_query,
      }),
      prisma.upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: upload_logs });
  }),
);

const getUploadedDataProductPath = (datasetId) => path.join(
  UPLOAD_PATH,
  'data_products',
  `${datasetId}`,
  'merged_chunks',
);

// Post a Dataset's upload log, files' info and the Dataset to the database - UI
router.post(
  '/dataset',
  isPermittedTo('update'),
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

    const createDatasetQuery = {
      dataset_upload: {
        create: {
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
              // origin_path: getUploadedDataProductPath(data_product_id),
              type: 'DATA_PRODUCT',
            },
          },
        },
      },
    };

    const datasetUploadLog = await prisma.$transaction(async (tx) => {
      const upload_log = await tx.upload_log.create({
        data: {
          status: config.upload.status.UPLOADING,
          user: {
            connect: {
              id: req.user.id,
            },
          },
          files: {
            create: files_metadata.map((file) => ({
              name: file.name,
              md5: file.checksum,
              num_chunks: file.num_chunks,
              path: file.path,
              status: config.upload.status.UPLOADING,
            })),
          },
          ...createDatasetQuery,
        },
        include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });

      const uploadedDatasetId = upload_log.dataset_upload.dataset.id;
      await tx.dataset.update({
        where: { id: uploadedDatasetId },
        data: {
          origin_path: getUploadedDataProductPath(uploadedDatasetId),
        },
      });

      const updated_upload_log = await tx.upload_log.findUnique({
        where: {
          id: upload_log.id,
        },
        include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });
      return updated_upload_log;
    });

    res.json(datasetUploadLog);
  }),
);

// Get an upload log - UI, worker
router.get(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Retrieve past upload by id'

    const upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
    });
    res.json(upload_log);
  }),
);

// Update an upload log and it's files - UI, workers
router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('status').notEmpty().escape().optional(),
    body('files').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Update past upload'

    const { status, files } = req.body;
    const update_query = _.omitBy(_.isUndefined)({
      status,
    });

    const updates = [];
    updates.push(prisma.upload_log.update({
      where: { id: req.params.id },
      data: update_query,
      include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
    }));
    (files || []).forEach((f) => {
      updates.push(prisma.file_upload_log.update({
        where: { id: f.id },
        data: f.data,
      }));
    });

    const results = await prisma.$transaction(updates);
    // results of Prisma transaction promises are returned in the order in
    // which the promises were submitted
    res.json(results[0]);
  }),
);

// Initiate the processing of uploaded files - worker
router.post(
  '/:id/process',
  validate([
    param('id').isInt().toInt(),
    query('upload_type').isIn(Object.values(Object.values(config.upload.types))).optional(),
  ]),
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Initiate the processing of a completed upload'

    // Conditionally handle different upload types
    if (req.query.upload_type === config.upload.types.DATASET) {
      const dataset = await prisma.dataset.findFirst({
        where: {
          id: Number(req.params.id),
        },
        include: {
          workflows: true,
        },
      });
      const workflow = await datasetService.create_workflow(dataset, 'process_dataset_upload');
      res.json(workflow);
    }
  }),
);

module.exports = router;
