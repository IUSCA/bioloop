const express = require('express');
const createError = require('http-errors');
const {
  query, param, body,
} = require('express-validator');
const _ = require('lodash/fp');
const { Prisma } = require('@prisma/client');
const config = require('config');
const fs = require('fs');
const path = require('path');

const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');
const datasetService = require('@/services/dataset');
const CONSTANTS = require('@/constants');
const logger = require('@/services/logger');
const prisma = require('@/db');

const isPermittedTo = accessControl('datasets');

console.log('============ LOADING datasets/uploads.js module ============');

const router = express.Router();

// ============================================================================
// LITERAL ROUTES (must come before parametrized routes like /:username)
// ============================================================================

// Get stalled uploads (UPLOADED, VERIFYING, or VERIFIED - need processing)
// Used by Workers
router.get(
  '/stalled',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get stalled uploads needing processing'

    const stalledThreshold = new Date(Date.now() - 30 * 1000); // 30 second buffer to avoid race conditions

    const stalled = await prisma.dataset_upload_log.findMany({
      where: {
        status: {
          in: [
            CONSTANTS.UPLOAD_STATUSES.UPLOADED,
            CONSTANTS.UPLOAD_STATUSES.VERIFYING,
            CONSTANTS.UPLOAD_STATUSES.VERIFIED,
          ],
        },
        updated_at: { lt: stalledThreshold },
      },
      include: {
        dataset: true,
      },
    });

    res.json({
      metadata: { count: stalled.length },
      uploads: stalled.map((u) => ({
        dataset_id: u.dataset.id,
        dataset_name: u.dataset.name,
        uploaded_at: u.updated_at,
      })),
    });
  }),
);

// Get failed uploads (with retry count filter)
// Used by Workers
router.get(
  '/failed',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get failed uploads eligible for retry'

    const { max_retry_count = 2, max_age_hours = 72 } = req.query;
    const cutoffDate = new Date(Date.now() - max_age_hours * 60 * 60 * 1000);

    const failed = await prisma.dataset_upload_log.findMany({
      where: {
        status: 'PROCESSING_FAILED',
        retry_count: { lte: parseInt(max_retry_count, 10) },
        updated_at: { gte: cutoffDate },
      },
      include: {
        dataset: true,
      },
    });

    res.json({
      uploads: failed.map((u) => ({
        dataset_id: u.dataset.id,
        dataset_name: u.dataset.name,
        retry_count: u.retry_count || 0,
        last_error: u.metadata?.failure_reason || null,
      })),
    });
  }),
);

// Get expired uploads (UPLOADING > X days)
// Used by Workers
router.get(
  '/expired',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get expired uploads'

    const { status = 'UPLOADING', age_days = 7 } = req.query;
    const cutoffDate = new Date(Date.now() - age_days * 24 * 60 * 60 * 1000);

    const expired = await prisma.dataset_upload_log.findMany({
      where: {
        status,
        updated_at: { lt: cutoffDate },
      },
      include: {
        dataset: true,
      },
    });

    res.json({
      uploads: expired.map((u) => ({
        dataset_id: u.dataset.id,
        dataset_name: u.dataset.name,
        status: u.status,
        age_days: Math.floor((Date.now() - u.updated_at) / (24 * 60 * 60 * 1000)),
      })),
    });
  }),
);

// Get all process IDs (for orphaned file detection)
// Used by Workers
router.get(
  '/all-process-ids',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get all upload process IDs'

    const uploads = await prisma.dataset_upload_log.findMany({
      select: { process_id: true },
      where: { process_id: { not: null } },
    });

    res.json({
      process_ids: uploads.map((u) => u.process_id).filter(Boolean),
    });
  }),
);

// Get uploads by status (for monitoring)
// Used by Workers
router.get(
  '/by-status',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get uploads by status'

    const { statuses = [] } = req.query;

    const uploads = await prisma.dataset_upload_log.findMany({
      where: {
        status: { in: statuses },
      },
      include: {
        dataset: true,
      },
    });

    res.json({
      uploads: uploads.map((u) => ({
        dataset_id: u.dataset.id,
        dataset_name: u.dataset.name,
        origin_path: u.dataset.origin_path,
        status: u.status,
      })),
    });
  }),
);

// ============================================================================
// PARAMETRIZED ROUTES (must come after literal routes)
// ============================================================================

// Used by:
//  - UI
//  - Workers
router.get(
  '/',
  validate([
    query('status').isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)).optional(),
    query('dataset_name').optional().trim().isLength({ min: 1 }),
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

    // Only show uploads that have a process_id (TUS upload was registered)
    // This hides incomplete/orphaned uploads from users
    const where = {
      process_id: { not: null },
    };
    if (status) {
      where.status = status;
    }
    if (dataset_name) {
      where.dataset = {
        name: {
          contains: dataset_name,
          mode: 'insensitive',
        },
      };
    }

    const filter_query = {
      skip: offset ?? Prisma.skip,
      take: limit ?? Prisma.skip,
      where,
      orderBy: {
        updated_at: 'desc',
      },
    };

    const [dataset_upload_logs, count] = await prisma.$transaction([
      prisma.dataset_upload_log.findMany({
        ...filter_query,
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      }),
      prisma.dataset_upload_log.count({ where }),
    ]);

    res.json({ metadata: { count }, uploads: dataset_upload_logs });
  }),
);

// Used by UI
router.get(
  '/:username',
  validate([
    query('status').isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)).optional(),
    query('dataset_name').optional().trim().isLength({ min: 1 }),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    param('username').trim().notEmpty(),
  ]),
  isPermittedTo('read', { checkOwnership: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Retrieve past uploads for a specific user'

    const {
      status, dataset_name, offset, limit,
    } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (dataset_name) {
      where.dataset = {
        name: {
          contains: dataset_name,
          mode: 'insensitive',
        },
      };
    }
    // Filter by user via dataset's audit logs
    where.dataset = {
      ...where.dataset,
      audit_logs: {
        some: {
          action: 'create',
          user: {
            username: req.params.username,
          },
        },
      },
    };

    const filter_query = {
      skip: offset ?? Prisma.skip,
      take: limit ?? Prisma.skip,
      where,
      orderBy: {
        updated_at: 'desc',
      },
    };

    const [dataset_upload_logs, count] = await prisma.$transaction([
      prisma.dataset_upload_log.findMany({
        ...filter_query,
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      }),
      prisma.dataset_upload_log.count({ where }),
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
    body('type').trim().notEmpty().isIn(config.dataset_types),
    body('name').trim().notEmpty().isLength({ min: 3 }),
    body('src_dataset_id').optional().isInt().toInt(),
    body('project_id').optional(),
    body('src_instrument_id').optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Register an uploaded dataset in the system'

    const {
      project_id, src_instrument_id, src_dataset_id, name, type,
    } = req.body;

    logger.info(`[UPLOAD-CREATE] Starting dataset upload registration`, {
      user: req.user?.username,
      user_id: req.user?.id,
      dataset_name: name,
      dataset_type: type,
      project_id,
      src_instrument_id,
      src_dataset_id,
    });

    try {
      const datasetCreateQuery = await datasetService.buildDatasetCreateQuery({
        name,
        type,
        user_id: req.user.id,
        src_instrument_id,
        src_dataset_id,
        create_method: CONSTANTS.DATASET_CREATE_METHODS.UPLOAD,
      });

      logger.info(`[UPLOAD-CREATE] Dataset create query built successfully for '${name}'`);

      const dataset_upload_log = await prisma.$transaction(async (tx) => {
        logger.info(`[UPLOAD-CREATE] Starting database transaction for '${name}'`);

        const createdDataset = await datasetService.create({
          tx, data: datasetCreateQuery, project_id, requester_id: req.user.id,
        });
        logger.info(`[UPLOAD-CREATE] Dataset created`, {
          dataset_id: createdDataset.id,
          dataset_name: createdDataset.name,
          dataset_type: createdDataset.type,
        });

        // Set origin_path to the predetermined location where files will be moved to
        // This is deterministic and doesn't depend on the /complete endpoint
        // Format: /uploads/{type}/{id}/{name}
        const uploadBasePath = config.get('upload.path');
        const datasetOriginPath = path.join(
          uploadBasePath,
          type.toLowerCase(),
          `${createdDataset.id}`,
          createdDataset.name,
        );

        await tx.dataset.update({
          where: { id: createdDataset.id },
          data: {
            origin_path: datasetOriginPath,
          },
        });

        logger.info(`[UPLOAD-CREATE] Origin path set`, {
          dataset_id: createdDataset.id,
          origin_path: datasetOriginPath,
        });

        // Create dataset_upload_log linked directly to dataset
        const created_dataset_upload_log = await tx.dataset_upload_log.create({
          data: {
            status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
            dataset: {
              connect: {
                id: createdDataset.id,
              },
            },
          },
          select: {
            id: true,
          },
        });

        logger.info(`[UPLOAD-CREATE] Upload log created`, {
          upload_log_id: created_dataset_upload_log.id,
          dataset_id: createdDataset.id,
          initial_status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
        });

        const updated_dataset_upload_log = await tx.dataset_upload_log.findUnique({
          where: { id: created_dataset_upload_log.id },
          include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
        });

        logger.info(`[UPLOAD-CREATE] Transaction complete, returning upload log`, {
          upload_log_id: updated_dataset_upload_log.id,
          dataset_id: createdDataset.id,
        });

        return updated_dataset_upload_log;
      });

      logger.info(`[UPLOAD-CREATE] SUCCESS: Dataset upload registered`, {
        upload_log_id: dataset_upload_log.id,
        dataset_id: dataset_upload_log.dataset.id,
        dataset_name: dataset_upload_log.dataset.name,
        user: req.user?.username,
      });

      res.json(dataset_upload_log);
    } catch (error) {
      logger.error(`[UPLOAD-CREATE] FAILED: Error registering dataset upload`, {
        user: req.user?.username,
        dataset_name: name,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }),
);

// - Complete a TUS upload (called after UI finishes uploading)
// - Updates dataset_upload_log, moves files, prepares for workflow
router.post(
  '/:id/complete',
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
  [
    body('process_id').isString().notEmpty(),
    body('selection_mode').optional().isString(),
    body('directory_name').optional().isString(),
    body('relative_path').optional().isString(),
    body('metadata').optional().isObject(),
  ],
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Mark TUS upload as complete and prepare for processing'

    const datasetId = parseInt(req.params.id, 10);
    const {
      process_id, selection_mode, directory_name, relative_path, metadata,
    } = req.body;

    logger.info(`[UPLOAD-COMPLETE] Starting upload completion`, {
      dataset_id: datasetId,
      process_id,
      selection_mode,
      directory_name,
      relative_path,
      has_metadata: !!metadata,
      user: req.user?.username,
    });

    try {
      // Find the upload log
      const uploadLog = await prisma.dataset_upload_log.findFirst({
        where: {
          dataset_id: datasetId,
        },
        include: {
          dataset: true,
        },
      });

      if (!uploadLog) {
        logger.error(`[UPLOAD-COMPLETE] FAILED: No upload log found`, {
          dataset_id: datasetId,
          process_id,
          user: req.user?.username,
        });
        return res.status(404).json({ error: 'Upload log not found' });
      }

      logger.info(`[UPLOAD-COMPLETE] Upload log found`, {
        upload_log_id: uploadLog.id,
        dataset_id: datasetId,
        current_status: uploadLog.status,
        dataset_name: uploadLog.dataset.name,
      });

      // Idempotency: If already UPLOADED, return success immediately
      if (uploadLog.status === CONSTANTS.UPLOAD_STATUSES.UPLOADED) {
        logger.info(`[UPLOAD-COMPLETE] Idempotent request - already completed`, {
          dataset_id: datasetId,
          upload_log_id: uploadLog.id,
          process_id,
        });
        return res.json({
          success: true,
          upload_log: uploadLog,
        });
      }

      // Get dataset type for proper path structure
      const dataset = uploadLog.dataset;
      const datasetType = dataset.type;

      // Get TUS upload info to verify completion and get file details
      const uploadPath = config.get('upload.path');
      const tusFilePath = path.join(uploadPath, process_id);
      // TUS stores metadata as .json (not .info)
      const tusInfoPath = `${tusFilePath}.json`;

      // Check if TUS files exist
      if (!fs.existsSync(tusFilePath)) {
        logger.error(`[UPLOAD-COMPLETE] FAILED: TUS file not found`, {
          dataset_id: datasetId,
          process_id,
          expected_path: tusFilePath,
        });
        return res.status(404).json({ error: 'Upload file not found' });
      }

      logger.info(`[UPLOAD-COMPLETE] TUS file found`, {
        dataset_id: datasetId,
        process_id,
        tus_file_path: tusFilePath,
      });

      // Read TUS metadata
      let tusMetadata = {};
      let fileSize = 0;
      let originalFilename = 'uploaded_file';

      if (fs.existsSync(tusInfoPath)) {
        const infoContent = fs.readFileSync(tusInfoPath, 'utf8');
        tusMetadata = JSON.parse(infoContent);
        // TUS stores metadata in lowercase 'metadata' field
        originalFilename = tusMetadata.metadata?.filename || tusMetadata.metadata?.name || originalFilename;
        logger.info(`[UPLOAD-COMPLETE] TUS metadata read`, {
          dataset_id: datasetId,
          process_id,
          filename: originalFilename,
          metadata: tusMetadata.metadata,
        });
      } else {
        logger.warn(`[UPLOAD-COMPLETE] TUS info file not found (using defaults)`, {
          dataset_id: datasetId,
          process_id,
          expected_path: tusInfoPath,
        });
      }

      // Get file size
      const stats = fs.statSync(tusFilePath);
      fileSize = stats.size;

      logger.info(`[UPLOAD-COMPLETE] File size determined`, {
        dataset_id: datasetId,
        process_id,
        file_size_bytes: fileSize,
        file_size_mb: (fileSize / (1024 * 1024)).toFixed(2),
      });

      // Use the origin_path that was set at dataset creation
      // (dataset-specific directory: /uploads/{type}/{id}/)
      const baseOriginPath = dataset.origin_path;

      // Determine final file path based on upload mode
      let finalPath;

      if (selection_mode === 'directory' && relative_path) {
        // Directory upload: preserve directory structure under dataset's origin_path
        const datasetUploadDir = path.join(baseOriginPath, directory_name || 'upload');
        finalPath = path.join(datasetUploadDir, relative_path);

        logger.info(`[UPLOAD-COMPLETE] Directory upload mode`, {
          dataset_id: datasetId,
          process_id,
          directory_name,
          relative_path,
          source: tusFilePath,
          destination: finalPath,
        });

        // Create parent directory if needed
        const parentDir = path.dirname(finalPath);
        if (!fs.existsSync(parentDir)) {
          logger.info(`[UPLOAD-COMPLETE] Creating parent directory`, {
            dataset_id: datasetId,
            parent_dir: parentDir,
          });
          fs.mkdirSync(parentDir, { recursive: true });
        }

        // Move file (idempotent: skip if already exists at destination)
        if (!fs.existsSync(finalPath)) {
          logger.info(`[UPLOAD-COMPLETE] Moving file`, {
            dataset_id: datasetId,
            source: tusFilePath,
            destination: finalPath,
          });
          fs.renameSync(tusFilePath, finalPath);
          logger.info(`[UPLOAD-COMPLETE] File moved successfully`, {
            dataset_id: datasetId,
            destination: finalPath,
          });
        } else {
          logger.info(`[UPLOAD-COMPLETE] File already exists at destination (idempotent)`, {
            dataset_id: datasetId,
            destination: finalPath,
          });
        }
      } else {
        // Single file upload: move to dataset's origin_path
        finalPath = path.join(baseOriginPath, originalFilename);

        logger.info(`[UPLOAD-COMPLETE] Single file upload mode`, {
          dataset_id: datasetId,
          process_id,
          filename: originalFilename,
          source: tusFilePath,
          destination: finalPath,
        });

        // Create dataset directory if needed
        if (!fs.existsSync(baseOriginPath)) {
          logger.info(`[UPLOAD-COMPLETE] Creating dataset directory`, {
            dataset_id: datasetId,
            directory: baseOriginPath,
          });
          fs.mkdirSync(baseOriginPath, { recursive: true });
        }

        // Move file (idempotent: skip if already exists at destination)
        if (!fs.existsSync(finalPath)) {
          logger.info(`[UPLOAD-COMPLETE] Moving file`, {
            dataset_id: datasetId,
            source: tusFilePath,
            destination: finalPath,
          });
          fs.renameSync(tusFilePath, finalPath);
          logger.info(`[UPLOAD-COMPLETE] File moved successfully`, {
            dataset_id: datasetId,
            destination: finalPath,
          });
        } else {
          logger.info(`[UPLOAD-COMPLETE] File already exists at destination (idempotent)`, {
            dataset_id: datasetId,
            destination: finalPath,
          });
        }
      }

      logger.info(`[UPLOAD-COMPLETE] File is ready`, {
        dataset_id: datasetId,
        final_path: finalPath,
        origin_path: baseOriginPath,
      });

      // Update upload log
      const updateData = {
        status: CONSTANTS.UPLOAD_STATUSES.UPLOADED,
        process_id,
        updated_at: new Date(),
      };

      // Add metadata if provided (e.g., checksum from UI)
      if (metadata) {
        logger.info(`[UPLOAD-COMPLETE] Merging metadata`, {
          dataset_id: datasetId,
          existing_metadata: uploadLog.metadata,
          new_metadata: metadata,
        });
        // Merge with existing metadata
        updateData.metadata = {
          ...(uploadLog.metadata || {}),
          ...metadata,
        };
      }

      logger.info(`[UPLOAD-COMPLETE] Updating upload log`, {
        dataset_id: datasetId,
        upload_log_id: uploadLog.id,
        new_status: CONSTANTS.UPLOAD_STATUSES.UPLOADED,
        process_id,
      });

      // Update upload log with file info (origin_path already set at dataset creation)
      const updatedLog = await prisma.dataset_upload_log.update({
        where: { id: uploadLog.id },
        data: updateData,
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });

      logger.info(`[UPLOAD-COMPLETE] SUCCESS: Upload completed`, {
        dataset_id: datasetId,
        upload_log_id: updatedLog.id,
        dataset_name: updatedLog.dataset.name,
        status: updatedLog.status,
        process_id: updatedLog.process_id,
        user: req.user?.username,
      });

      res.json({
        success: true,
        upload_log: updatedLog,
      });
    } catch (error) {
      logger.error(`[UPLOAD-COMPLETE] FAILED: Error completing upload`, {
        dataset_id: datasetId,
        process_id,
        error: error.message,
        stack: error.stack,
        user: req.user?.username,
      });

      // Try to update status to failed
      try {
        logger.info(`[UPLOAD-COMPLETE] Attempting to mark upload as failed`, {
          dataset_id: datasetId,
        });

        // Get existing metadata first
        const existingLog = await prisma.dataset_upload_log.findFirst({
          where: {
            dataset_id: datasetId,
          },
          select: { metadata: true },
        });

        await prisma.dataset_upload_log.updateMany({
          where: {
            dataset_id: datasetId,
          },
          data: {
            status: CONSTANTS.UPLOAD_STATUSES.PROCESSING_FAILED,
            metadata: {
              ...(existingLog?.metadata || {}),
              failure_reason: error.message,
            },
          },
        });

        logger.info(`[UPLOAD-COMPLETE] Upload marked as PROCESSING_FAILED`, {
          dataset_id: datasetId,
        });
      } catch (updateError) {
        logger.error(`[UPLOAD-COMPLETE] Failed to update upload log status`, {
          dataset_id: datasetId,
          error: updateError.message,
        });
      }

      return res.status(500).json({ error: 'Failed to complete upload', details: error.message });
    }
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
    body('status').optional().trim().isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)),
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Update the metadata related to a dataset upload event'

    const { status } = req.body;
    const dataset_upload_log_update_query = _.omitBy(_.isUndefined)({
      status,
    });

    const dataset_upload_log = await prisma.$transaction(async (tx) => {
      let ds_upload_log = await tx.dataset_upload_log.findFirstOrThrow({
        where: { dataset_id: req.params.id },
      });

      if (Object.entries(dataset_upload_log_update_query).length > 0) {
        await tx.dataset_upload_log.update({
          where: { id: ds_upload_log.id },
          data: dataset_upload_log_update_query,
        });
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

// Get upload log for a dataset (used by workers)
router.get(
  '/:id/upload-log',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get upload log for a dataset'

    const datasetId = parseInt(req.params.id, 10);

    const uploadLog = await prisma.dataset_upload_log.findFirst({
      where: {
        dataset_id: datasetId,
      },
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
            type: true,
            origin_path: true,
          },
        },
      },
    });

    if (!uploadLog) {
      return res.status(404).json({ error: 'Upload log not found' });
    }

    res.json(uploadLog);
  }),
);

// Update upload log metadata (e.g., checksum) - used by UI and workers
router.patch(
  '/:id/upload-log',
  isPermittedTo('update'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Update dataset upload log metadata'

    const datasetId = parseInt(req.params.id, 10);
    const { metadata, status, retry_count } = req.body;

    logger.info(`[UPLOAD-LOG-UPDATE] Updating upload log`, {
      dataset_id: datasetId,
      has_metadata: !!metadata,
      new_status: status,
      new_retry_count: retry_count,
      user: req.user?.username,
    });

    // Find upload log for this dataset
    const uploadLog = await prisma.dataset_upload_log.findFirst({
      where: {
        dataset_id: datasetId,
      },
    });

    if (!uploadLog) {
      logger.error(`[UPLOAD-LOG-UPDATE] FAILED: Upload log not found`, {
        dataset_id: datasetId,
        user: req.user?.username,
      });
      return res.status(404).json({ error: 'Upload log not found' });
    }

    logger.info(`[UPLOAD-LOG-UPDATE] Upload log found`, {
      upload_log_id: uploadLog.id,
      dataset_id: datasetId,
      current_status: uploadLog.status,
      current_retry_count: uploadLog.retry_count,
    });

    // Build update data
    const updateData = {};

    // Merge metadata (preserve existing fields)
    if (metadata) {
      const existingMetadata = uploadLog.metadata || {};
      updateData.metadata = { ...existingMetadata, ...metadata };
      logger.info(`[UPLOAD-LOG-UPDATE] Merging metadata`, {
        dataset_id: datasetId,
        existing_metadata: existingMetadata,
        new_metadata: metadata,
        merged_metadata: updateData.metadata,
      });
    }

    // Update status if provided
    if (status) {
      updateData.status = status;
      logger.info(`[UPLOAD-LOG-UPDATE] Updating status`, {
        dataset_id: datasetId,
        old_status: uploadLog.status,
        new_status: status,
      });
    }

    // Update retry_count if provided
    if (retry_count !== undefined) {
      updateData.retry_count = retry_count;
      logger.info(`[UPLOAD-LOG-UPDATE] Updating retry count`, {
        dataset_id: datasetId,
        old_retry_count: uploadLog.retry_count,
        new_retry_count: retry_count,
      });
    }

    const updated = await prisma.dataset_upload_log.update({
      where: { id: uploadLog.id },
      data: updateData,
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    logger.info(`[UPLOAD-LOG-UPDATE] SUCCESS: Upload log updated`, {
      upload_log_id: updated.id,
      dataset_id: datasetId,
      dataset_name: updated.dataset.name,
      new_status: updated.status,
      new_retry_count: updated.retry_count,
      user: req.user?.username,
    });

    res.json({ success: true, upload_log: updated });
  }),
);

/**
 * Get upload details by dataset ID
 * GET /api/datasets/uploads/:id/logs
 */
router.get(
  '/:id/logs',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get upload details by dataset ID'

    const datasetId = parseInt(req.params.id, 10);

    // Get upload log by dataset_id (1:1 relationship)
    const uploadLog = await prisma.dataset_upload_log.findFirst({
      where: { dataset_id: datasetId },
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!uploadLog) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    res.json({
      id: uploadLog.id,
      status: uploadLog.status,
      process_id: uploadLog.process_id,
      retry_count: uploadLog.retry_count,
      metadata: uploadLog.metadata,
      updated_at: uploadLog.updated_at,
      dataset: uploadLog.dataset,
    });
  }),
);

/**
 * Get upload status for a dataset
 * GET /api/datasets/uploads/:datasetId/status
 */
router.get(
  '/:datasetId/status',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get upload status for a dataset'

    const datasetId = parseInt(req.params.datasetId, 10);

    // Get upload log
    const uploadLog = await prisma.dataset_upload_log.findFirst({
      where: {
        dataset_id: datasetId,
      },
      include: {
        dataset: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!uploadLog) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    res.json({
      status: uploadLog.status,
      process_id: uploadLog.process_id,
      retry_count: uploadLog.retry_count,
      metadata: uploadLog.metadata,
      updated_at: uploadLog.updated_at,
      dataset: uploadLog.dataset,
    });
  }),
);

module.exports = router;
