const express = require('express');
const { PrismaClient } = require('@prisma/client');
const createError = require('http-errors');
const {
  query, param, body,
} = require('express-validator');
const _ = require('lodash/fp');
const config = require('config');

const asyncHandler = require('../../middleware/asyncHandler');
const { accessControl } = require('../../middleware/auth');
const { validate } = require('../../middleware/validators');
const datasetService = require('../../services/dataset');
const CONSTANTS = require('../../constants');
const logger = require('../../services/logger');

const isPermittedTo = accessControl('datasets');

const router = express.Router();
const prisma = new PrismaClient();

// Used by:
//  - UI
//  - Workers
router.get(
  '/',
  validate([
    query('status').isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)).optional(),
    query('dataset_name').optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
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
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      }),
      prisma.dataset_upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
  }),
);

// Used by UI
router.get(
  '/:username',
  validate([
    query('status').isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)).optional(),
    query('dataset_name').optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    param('username').escape().notEmpty(),
  ]),
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Retrieve past uploads for a specific user'

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
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      }),
      prisma.dataset_upload_log.count({ ...query_obj }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
  }),
);

// - Register an uploaded dataset in the system
// - Used by UI
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('type').escape().notEmpty().isIn(config.dataset_types),
    body('name').escape().notEmpty().isLength({ min: 3 }),
    body('src_dataset_id').optional().isInt().toInt(),
    body('files_metadata').isArray(),
    body('project_id').optional(),
    body('src_instrument_id').optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Register an uploaded dataset in the system'

    const {
      project_id, src_instrument_id, src_dataset_id, name, type, files_metadata,
    } = req.body;

    const datasetCreateQuery = datasetService.buildDatasetCreateQuery({
      name,
      type,
      project_id,
      user_id: req.user.id,
      src_instrument_id,
      src_dataset_id,
    });

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      const createdDataset = await datasetService.createDatasetInTransaction(tx, datasetCreateQuery);

      const created_dataset_upload_log = await tx.dataset_upload_log.create({
        data: {
          status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
          files: {
            create: files_metadata.map((file) => ({
              name: file.name,
              md5: file.checksum,
              num_chunks: file.num_chunks,
              path: file.path,
              status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
            })),
          },
          audit_log: {
            create: {
              action: 'create',
              create_method: CONSTANTS.DATASET_CREATE_METHODS.UPLOAD,
              dataset_id: createdDataset.id,
              user_id: req.user.id,
            },
          },
        },
        select: {
          id: true,
        },
      });

      await tx.dataset.update({
        where: { id: createdDataset.id },
        data: {
          origin_path: datasetService.getUploadedDatasetPath({ datasetId: createdDataset.id, datasetType: type }),
        },
      });

      const updated_dataset_upload_log = await tx.dataset_upload_log.findUnique({
        where: { id: created_dataset_upload_log.id },
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });
      return updated_dataset_upload_log;
    });

    res.json(dataset_upload_log);
  }),
);

// - Update the metadata related to a dataset upload event
// - Used by UI, workers
router.patch(
  '/:id',
  /**
     * A user can only update metadata related to a dataset upload if one of the
     * following two conditions are met:
     *   - The user has either the `admin` or the `operator` role
     *   - The user has the `user` role, and they are the one who uploaded this dataset.
     * This is checked by the `isPermittedTo` middleware.
     */
  isPermittedTo(
    'update',
    { checkOwnership: true },
    async (req, res, next) => { // resourceOwnerFn
      try {
        const dataset_creator = await datasetService.get_dataset_creator({ dataset_id: parseInt(req.params.id, 10) });
        return dataset_creator.username;
      } catch (error) {
        logger.error(error);
        return next(createError.InternalServerError());
      }
    },
  ),
  validate([
    param('id').isInt().toInt(),
    body('status').optional(),
    body('files').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Update the metadata related to a dataset upload event'

    const { status, files = [] } = req.body;
    const dataset_upload_log_update_query = _.omitBy(_.isUndefined)({
      status,
    });

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      const dataset_upload_audit_log = await tx.dataset_audit.findUniqueOrThrow({
        where: {
          dataset_id_create_method: {
            dataset_id: req.params.id,
            create_method: CONSTANTS.DATASET_CREATE_METHODS.UPLOAD,
          },
        },
      });

      let ds_upload_log = await tx.dataset_upload_log.findUniqueOrThrow({
        where: { audit_log_id: dataset_upload_audit_log.id },
      });

      if (Object.entries(dataset_upload_log_update_query).length > 0) {
        await tx.dataset_upload_log.update({
          where: { id: ds_upload_log.id },
          data: dataset_upload_log_update_query,
        });
      }

      if (files.length > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (const f of files) {
          // eslint-disable-next-line no-await-in-loop
          await tx.file_upload_log.update({
            where: { id: f.id },
            data: f.data,
          });
        }
      }

      ds_upload_log = await tx.dataset_upload_log.findUniqueOrThrow({
        where: { id: ds_upload_log.id },
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });

      return ds_upload_log;
    });

    res.json(dataset_upload_log);
  }),
);

router.post(
  '/:id/workflow/:wf',
  // Verify if this user is allowed to initiate the requested workflow on
  // the requested dataset.
  datasetService.workflow_access_check,
  validate([
    param('id').isInt().toInt(),
    param('wf').isIn([
      CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD,
      CONSTANTS.WORKFLOWS.CANCEL_DATASET_UPLOAD,
    ]),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Create and start a workflow to process a Dataset's upload, and associate it with the uploaded
    // Dataset.
    // Allowed workflows are process_dataset_upload, and cancel_dataset_upload.

    const wf_name = req.params.wf;

    const dataset = await datasetService.get_dataset({
      id: req.params.id,
      workflows: true,
    });

    if (!dataset) {
      return next(createError(404, 'Dataset not found'));
    }

    if (wf_name !== CONSTANTS.WORKFLOWS.PROCESS_DATASET_UPLOAD
          && wf_name !== CONSTANTS.WORKFLOWS.CANCEL_DATASET_UPLOAD) {
      return next(createError(400, 'Invalid workflow name'));
    }

    datasetService.initiateUploadWorkflow({
      dataset,
      requestedWorkflow: wf_name,
      user: req.user,
    }).then(({ workflowInitiated, workflowInitiationError }) => {
      if (workflowInitiated) {
        return res.json(workflowInitiated);
      }
      next(createError.InternalServerError(workflowInitiationError));
    }).catch(next);
  }),
);

module.exports = router;
