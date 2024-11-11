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
        type: upload_type,
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

// - Create upload logs for the dataset being uploaded and its files.
// - Register the dataset in the system
// - Used by UI
router.post(
  `/${config.upload.types.DATASET}`,
  isPermittedTo('update'),
  validate([
    body('name').escape().notEmpty().isLength({ min: 3 }),
    body('source_dataset_id').optional().isInt().toInt(),
    body('files_metadata').isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Create a record for a dataset upload'
    // todo - add swagger docs for query parameters, for 'upload_type'

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
              type: 'DATA_PRODUCT',
            },
          },
        },
      },
    };

    const upload_log = await prisma.$transaction(async (tx) => {
      const created_upload_log = await tx.upload_log.create({
        data: {
          status: config.upload.status.UPLOADING,
          user: {
            connect: {
              id: req.user.id,
            },
          },
          type: config.upload.types.DATASET,
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

      const uploadedDatasetId = created_upload_log.dataset_upload.dataset.id;
      await tx.dataset.update({
        where: { id: uploadedDatasetId },
        data: {
          origin_path: getUploadedDataProductPath(uploadedDatasetId),
        },
      });

      const updated_upload_log = await tx.upload_log.findUnique({
        where: {
          id: created_upload_log.id,
        },
        include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });
      return updated_upload_log;
    });

    res.json(upload_log);
  }),
);

// - Get an upload log
// - Used by UI, workers
router.get(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Retrieve an upload log by id'

    let upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
    });
    // todo - reading upload record twice - once to get the upload type and
    //  once to get the actual upload log with all its inclusions, is not good
    //  - HOW MUCH of these includes to I really need?
    //  - Return { upload_log: {...type, entity: {...entity }
    // -  Might be able to get awa with only returning the upload log itself,
    // without any inclusions? Make it the client's responsible for determining
    // the type?

    // how to know the upload type without getting it from the upload log?

    const upload_type = upload_log.type;
    const isDatasetUpload = upload_type === config.upload.types.DATASET;
    const upload_log_inclusions = isDatasetUpload ? INCLUDE_DATASET_UPLOAD_LOG_RELATIONS : undefined;

    upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
      include: upload_log_inclusions,
    });

    res.json(upload_log);
  }),
);

router.post(
  '/:id/cancel',
  isPermittedTo('delete'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Cancel a pending upload'

    const upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
    });
    const isDatasetUpload = upload_log.type === config.upload.types.DATASET;
    const uploadLogInclusions = isDatasetUpload ? INCLUDE_DATASET_UPLOAD_LOG_RELATIONS : undefined;

    let uploadedEntity;
    let workflowName;
    let workflowCreateFn;

    if (isDatasetUpload) {
      uploadedEntity = await prisma.dataset.findFirst({
        where: {
          id: req.params.id,
        },
      });
      workflowName = 'cancel_dataset_upload';
      workflowCreateFn = datasetService.create_workflow;
    }

    await workflowCreateFn(
      uploadedEntity,
      workflowName,
      req.user.id,
    );

    const uploadedEntityPrismaDeletePromise = prisma.dataset.delete({
      where: {
        id: uploadedEntity.id,
      },
    });
    const uploadLogPrismaDeletePromise = prisma.upload_log.delete({
      where: {
        id: req.params.id,
      },
      include: uploadLogInclusions,
    });

    const [deletedUpload] = await prisma.$transaction([
      uploadLogPrismaDeletePromise,
      uploadedEntityPrismaDeletePromise,
    ]);

    res.json(deletedUpload);
  }),
);

// - Update the upload logs created for an uploaded entity or its files
// - Used by UI, workers
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

    const upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
    });
    const isDatasetUpload = upload_log.type === config.upload.types.DATASET;
    const uploadLogInclusions = isDatasetUpload ? INCLUDE_DATASET_UPLOAD_LOG_RELATIONS : undefined;

    const updates = [];
    updates.push(prisma.upload_log.update({
      where: { id: req.params.id },
      data: update_query,
      include: uploadLogInclusions,
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

// - Initiate the processing of uploaded files
// - Used by workers
router.post(
  '/:id/process',
  validate([
    param('id').isInt().toInt(),
  ]),
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Initiate the processing of a completed upload'

    const upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
      include: { dataset_upload: true },
    });
    const upload_type = upload_log.type;

    // Conditionally handle different upload types
    if (upload_type === config.upload.types.DATASET) {
      const dataset = await prisma.dataset.findFirst({
        where: {
          id: upload_log.dataset_upload.dataset_id,
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
