const express = require('express');
const { body, query, param } = require('express-validator');
const config = require('config');
const _ = require('lodash/fp');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');

const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const authService = require('../services/auth');
const { INCLUDE_UPLOAD_LOG_RELATIONS } = require('../constants');

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
      console.error(e);
    }
    res.json(token);
  }),
);

router.get(
  '/',
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

const getDataProductOriginPath = (datasetId) => path.join(
  UPLOAD_PATH,
  'data_products',
  `${datasetId}`,
  'merged_chunks',
);

// Post a Dataset's upload log, files' info and the Dataset to the database - UI
router.post(
  '/',
  isPermittedTo('update'),
  validate([
    body('name').escape().notEmpty().isLength({ min: 3 }),
    body('source_dataset_id').optional().isInt().toInt(),
    body('files_metadata').isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    const {
      name, source_dataset_id, files_metadata,
    } = req.body;

    let upload_log;

    try {
      upload_log = await prisma.upload_log.create({
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
              ...(source_dataset_id && {
                source_datasets: {
                  create: [{
                    source_id: source_dataset_id,
                  }],
                },
              }),
              name,
              // origin_path: getDataProductOriginPath(data_product_id),
              type: config.dataset_types[1],
            },
          },
        },
        include: INCLUDE_UPLOAD_LOG_RELATIONS,
      });
    } catch (e) {
      console.error(e);
      // if upload log creation fails, don't proceed to updating the created
      // corresponding dataset's origin_path
      return next(createError.InternalServerError());
    }

    console.log('upload_log created');
    console.dir(upload_log, { depth: null });

    const datasetId = upload_log.dataset.id;

    // if upload log creation succeeds, but update to the corresponding
    // dataset's origin_path fails, then delete the created upload log
    try {
      await prisma.dataset.update({
        where: { id: datasetId },
        data: {
          origin_path: getDataProductOriginPath(datasetId),
        },
      });
    } catch (e) {
      console.error(e);
      await prisma.upload_log.delete({ where: { id: upload_log.id } });
      return next(createError.InternalServerError());
    }

    res.json(upload_log);
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
    const upload_log = await prisma.upload_log.findFirstOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_UPLOAD_LOG_RELATIONS,
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
    const { status, files } = req.body;
    const update_query = _.omitBy(_.isUndefined)({
      status,
      last_updated: new Date(),
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
  '/:id/file-upload-log/:file_upload_log_id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    param('file_upload_log_id').isInt().toInt(),
    body('status').notEmpty().escape(),
  ]),
  asyncHandler(async (req, res, next) => {
    const { status } = req.body;

    const upload_log = await prisma.upload_log.update({
      where: {
        id: req.params.id,
      },
      data: {
        files: {
          update: {
            where: { id: req.params.file_upload_log_id },
            data: {
              status,
            },
          },
        },
      },
    });

    res.json(upload_log);
  }),
);

module.exports = router;
