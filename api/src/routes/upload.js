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
const { INCLUDE_UPLOAD_LOG_RELATIONS } = require('../services/dataset');

const UPLOAD_PATH = config.upload.path;

const isPermittedTo = accessControl('datasets');

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
      // console.log('ERROR');
      console.log(e);
    }
    res.json(token);
  }),
);

router.get(
  '/logs',
  validate([
    query('status').isIn(Object.values(config.upload_status)).optional(),
    query('dataset_name').notEmpty().escape().optional(),
  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    const { status, dataset_name } = req.query;

    const query_obj = _.omitBy(_.isUndefined)({
      status,
      dataset: {
        name: { contains: dataset_name },
      },
    });

    const upload_logs = await prisma.upload_log.findMany({
      where: query_obj,
      include: INCLUDE_UPLOAD_LOG_RELATIONS,
    });

    res.json(upload_logs);
  }),
);

const getDataProductOriginPath = (datasetName) => path.join(
  UPLOAD_PATH,
  'data_products',
  datasetName,
  'merged_chunks',
);

// Post a Dataset's upload log, files' info and the Dataset to the database - UI
router.post(
  '/log',
  isPermittedTo('update'),
  validate([
    body('data_product_name').notEmpty().escape().isLength({ min: 3 }),
    body('file_type').isObject(),
    body('source_dataset_id').isInt().toInt(),
    body('files_metadata').isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    const {
      data_product_name, source_dataset_id, file_type, files_metadata,
    } = req.body;

    const upload_log = await prisma.upload_log.create({
      data: {
        status: config.upload_status.UPLOADING,
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
            status: config.upload_status.UPLOADING,
          })),
        },
        dataset: {
          create: {
            source_datasets: {
              create: [{
                source_id: source_dataset_id,
              }],
            },
            name: data_product_name,
            origin_path: getDataProductOriginPath(data_product_name),
            type: config.dataset_types[1],
            file_type: file_type.id === undefined ? {
              create: {
                name: file_type.name,
                extension: file_type.extension,
              },
            } : { connect: { id: file_type.id } },
          },
        },
      },
      include: INCLUDE_UPLOAD_LOG_RELATIONS,
    });

    res.json(upload_log);
  }),
);

// Get an upload log - UI, worker
router.get(
  '/log/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_UPLOAD_LOG_RELATIONS,
    });
    res.json(upload_log);
  }),
);

// Update an upload log and it's files - UI, workers
router.patch(
  '/log/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('status').notEmpty().escape().optional(),
    body('increment_processing_count').isBoolean().toBoolean().optional()
      .default(false),
    body('files').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    const { status, files, increment_processing_count } = req.body;
    const update_query = _.omitBy(_.isUndefined)({
      status,
      last_updated: new Date(),
      ...(increment_processing_count && {
        processing_attempt_count:
            {
              increment: 1,
            },
      }),
      ...(status === config.upload_status.FAILED && {
        dataset: {
          delete: true,
        },
      }),
    });

    const updates = [];
    updates.push(prisma.upload_log.update({
      where: { id: req.params.id },
      data: update_query,
    }));
    (files || []).forEach((f) => {
      updates.push(prisma.file_upload_log.update({
        where: { id: f.id },
        data: f.data,
      }));
    });

    await prisma.$transaction(updates);

    const upload = await prisma.upload_log.findUniqueOrThrow({
      where: {
        id: req.params.id,
      },
      include: INCLUDE_UPLOAD_LOG_RELATIONS,
    });
    res.json(upload);
  }),
);

// Update the attributes of an uploaded file - worker
router.patch(
  '/file-upload-log/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('status').notEmpty().escape(),
  ]),
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    const { status } = req.body;

    const file_upload_log = await prisma.file_upload_log.update({
      where: {
        id: req.params.id,
      },
      data: {
        status,
      },
    });

    res.json(file_upload_log);
  }),
);

module.exports = router;
