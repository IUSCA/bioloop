const express = require('express');
const { body, query, param } = require('express-validator');
const config = require('config');
const _ = require('lodash/fp');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const createError = require('http-errors');
const logger = require('../services/logger');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const datasetService = require('../services/dataset');
const workflowService = require('../services/workflow');
const {
  INCLUDE_DATASET_UPLOAD_LOG_RELATIONS, DATASET_CREATE_METHODS, WORKFLOWS, UPLOAD_STATUSES,
} = require('../constants');

const isPermittedTo = accessControl('datasetUploads');

const router = express.Router();
const prisma = new PrismaClient();

const get_dataset_active_workflows = async ({ dataset } = {}) => {
  const datasetWorkflowIds = dataset.workflows.map((wf) => wf.id);
  const workflowQueryResponse = await workflowService.getAll({
    workflow_ids: datasetWorkflowIds,
    app_id: config.get('app_id'),
    status: 'ACTIVE',
  });
  return workflowQueryResponse.data.results;
};

/**
 * Sets the user who uploaded the dataset in the request object `req`, for the `auth`
 * middleware to be able to retrieve the owner (uploader) of this resource (upload) and
 * thus verify if the current user is permitted to take certain actions on this upload.
 */
const setUploader = async (req, res, next) => {
  const dataset_upload_audit_log = await prisma.dataset_audit.findUniqueOrThrow({
    where: {
      dataset_id_create_method: {
        dataset_id: parseInt(req.params.dataset_id, 10),
        create_method: DATASET_CREATE_METHODS.UPLOAD,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  req.uploader = dataset_upload_audit_log.user;
  next();
};

router.get(
  '/all',
  validate([
    query('status').isIn(Object.values(UPLOAD_STATUSES)).optional(),
    query('dataset_name').notEmpty().escape().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Retrieve past uploads'

    const {
      status, dataset_name, offset, limit,
    } = req.query;

    const query_obj = {
      where: _.omitBy(_.isUndefined)({
        status,
        audit_log: {
          dataset: {
            name: { contains: dataset_name },
          },
        },
      }),
    };
    const filter_query = {
      skip: offset,
      take: limit,
      ...query_obj,
      orderBy: {
        audit_log: {
          timestamp: 'desc',
        },
      },
    };

    const [dataset_upload_logs, count] = await prisma.$transaction([
      prisma.dataset_upload_log.findMany({
        ...filter_query,
        include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      }),
      prisma.dataset_upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
  }),
);

router.get(
  '/:username/all',
  validate([
    query('status').isIn(Object.values(UPLOAD_STATUSES)).optional(),
    query('dataset_name').notEmpty().escape().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    param('username').escape().notEmpty(),
  ]),
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Retrieve past uploads'

    const {
      status, dataset_name, offset, limit,
    } = req.query;

    const query_obj = {
      where: _.omitBy(_.isUndefined)({
        status,
        audit_log: {
          dataset: {
            name: { contains: dataset_name },
          },
          user: {
            username: req.params.username,
          },
        },
      }),
    };
    const filter_query = {
      skip: offset,
      take: limit,
      ...query_obj,
      orderBy: {
        audit_log: {
          timestamp: 'desc',
        },
      },
    };

    const [dataset_upload_logs, count] = await prisma.$transaction([
      prisma.dataset_upload_log.findMany({
        ...filter_query,
        include: INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      }),
      prisma.dataset_upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
  }),
);

const getUploadedDatasetPath = ({ datasetId = null, datasetType = null } = {}) => path.join(
  config.upload.path,
  datasetType.toLowerCase(),
  `${datasetId}`,
  'processed',
);

// - Create upload logs for the dataset being uploaded and its files.
// - Register the dataset in the system
// - Used by UI
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('type').escape().notEmpty().isIn(config.dataset_types),
    body('name').escape().notEmpty().isLength({ min: 3 }),
    body('source_dataset_id').optional().isInt().toInt(),
    body('files_metadata').isArray(),
    body('project_id').optional(),
    body('src_instrument_id').optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Create a record for a dataset upload'

    const {
      name, source_dataset_id, files_metadata, type, project_id, src_instrument_id,
    } = req.body;

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      const created_dataset_upload_log = await tx.dataset_upload_log.create({
        data: {
          audit_log: {
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
                  type,
                  ...(project_id && {
                    projects: {
                      create: [{
                        project_id,
                        assignor_id: req.user.id,
                      }],
                    },
                  }),
                  ...(src_instrument_id && {
                    src_instrument: {
                      connect: {
                        id: src_instrument_id,
                      },
                    },
                  }),
                },
              },
              create_method: DATASET_CREATE_METHODS.UPLOAD,
              action: 'create',
              user: {
                connect: {
                  id: req.user.id,
                },
              },
            },
          },
          status: UPLOAD_STATUSES.UPLOADING,
          files: {
            create: files_metadata.map((file) => ({
              name: file.name,
              md5: file.checksum,
              num_chunks: file.num_chunks,
              path: file.path,
              status: UPLOAD_STATUSES.UPLOADING,
            })),
          },
        },
        select: {
          id: true,
          audit_log: {
            select: {
              dataset_id: true,
            },
          },
        },
      });

      const uploadedDatasetId = created_dataset_upload_log.audit_log.dataset_id;
      await tx.dataset.update({
        where: { id: uploadedDatasetId },
        data: {
          origin_path: getUploadedDatasetPath({ datasetId: uploadedDatasetId, datasetType: type }),
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

// - Update the upload logs created for an uploaded entity or its files
// - Used by UI, workers
router.patch(
  '/:dataset_id',
  setUploader,
  isPermittedTo(
    'update',
    { checkOwnership: true },
    (req) => req.uploader.username, // resourceOwnerFn
  ),
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

    // A user can only update an upload log one of the following two conditions are met:
    // 1. The user has either the `admin` or the `operator` role
    // 2. The user has the `user` role, and they are the one who initiated this upload.
    if (
      !(req.user.roles.includes('admin') || req.user.roles.includes('operator'))
        && req.uploader.id !== req.user.id
    ) {
      return next(createError.Forbidden());
    }

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      const dataset_upload_audit_log = await tx.dataset_audit.findUniqueOrThrow({
        where: {
          dataset_id_create_method: {
            dataset_id: req.params.dataset_id,
            create_method: DATASET_CREATE_METHODS.UPLOAD,
          },
        },
      });

      let ds_upload_log = await tx.dataset_upload_log.findUniqueOrThrow({
        where: { audit_log_id: dataset_upload_audit_log.id },
      });
      await tx.dataset_upload_log.update({
        where: { id: ds_upload_log.id },
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
// - Used by UI and workers
router.post(
  '/:dataset_id/process',
  validate([
    param('dataset_id').isInt().toInt(),
  ]),
  setUploader,
  isPermittedTo(
    'update',
    { checkOwnership: true },
    (req) => req.uploader.username, // resourceOwnerFn
  ),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Initiate the processing of a completed upload'

    logger.info(`Received request to process upload for dataset ${req.params.dataset_id}`);

    // A user can only process an upload if one of the following two conditions are met:
    // 1. The user has either the `admin` or the `operator` role
    // 2. The user has the `user` role, and they are the one who initiated this upload.
    if (
      !(req.user.roles.includes('admin') || req.user.roles.includes('operator'))
        && req.uploader.id !== req.user.id
    ) {
      return next(createError.Forbidden());
    }

    const uploadedDataset = await prisma.dataset.findUnique({
      where: {
        id: req.params.dataset_id,
      },
      include: {
        workflows: true,
      },
    });

    // This dataset upload may have been cancelled before this point,
    // hence, check if the uploaded dataset is still registered in the system
    if (!uploadedDataset) {
      return next(createError.NotFound(`Dataset ${req.params.dataset_id} not found`));
    }

    // If the uploaded dataset is still registered in the system and not yet
    // cancelled, check if the workflow to cancel it is underway.
    uploadedDataset.workflows = await get_dataset_active_workflows({ dataset: uploadedDataset });
    const cancelUploadWorkflow = uploadedDataset.workflows.find(
      (wf) => wf.name === WORKFLOWS.CANCEL_DATASET_UPLOAD,
    );
    const isCancelUploadWorkflowRunning = !!cancelUploadWorkflow;

    if (!isCancelUploadWorkflowRunning) {
      logger.info('Starting workflow to process the upload');
      const processUploadWorkflow = await datasetService.create_workflow(
        uploadedDataset,
        WORKFLOWS.PROCESS_DATASET_UPLOAD,
        req.user.id,
      );
      res.json(processUploadWorkflow);
    } else {
      const error = 'Cannot process upload. A request to cancel this upload '
            + `(workflow ${cancelUploadWorkflow.id}) is already in progress.`;
      logger.error(error);
      return next(createError.BadRequest(error));
    }
  }),
);

// - Cancel an in-progress upload
// - Used by UI
router.post(
  '/:dataset_id/cancel',
  setUploader,
  isPermittedTo(
    'update',
    { checkOwnership: true },
    (req) => req.uploader.username, // resourceOwnerFn
  ),
  validate([
    param('dataset_id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Cancel an in-progress upload'

    logger.info(`Received request to cancel upload for dataset ${req.params.dataset_id}`);

    // A user can only cancel an upload if one of the following two conditions are met:
    // 1. The user has either the `admin` or the `operator` role
    // 2. The user has the `user` role, and they are the one who initiated this upload.
    if (
      !(req.user.roles.includes('admin') || req.user.roles.includes('operator'))
        && req.uploader.id !== req.user.id
    ) {
      return next(createError.Forbidden());
    }

    const uploadedDataset = await prisma.dataset.findUniqueOrThrow({
      where: {
        id: req.params.dataset_id,
      },
      include: {
        workflows: true,
      },
    });

    // Check if the workflow to process this upload is already underway. If so,
    // it's too late to cancel the upload.
    uploadedDataset.workflows = await get_dataset_active_workflows({ dataset: uploadedDataset });
    const processUploadWorkflow = uploadedDataset.workflows.find(
      (wf) => wf.name === WORKFLOWS.PROCESS_DATASET_UPLOAD,
    );
    const isProcessUploadWorkflowRunning = !!processUploadWorkflow;

    if (!isProcessUploadWorkflowRunning) {
      logger.info('Starting workflow to cancel the upload');
      const cancelUploadWorkflow = await datasetService.create_workflow(
        uploadedDataset,
        WORKFLOWS.CANCEL_DATASET_UPLOAD,
        req.user.id,
      );
      res.json(cancelUploadWorkflow);
    } else {
      const error = 'Cannot cancel upload. A request to process this upload '
            + `(workflow ${processUploadWorkflow.id}) is already in progress.`;
      logger.error(error);
      return next(createError.BadRequest(error));
    }
  }),
);

module.exports = router;
