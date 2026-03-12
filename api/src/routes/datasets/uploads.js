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

const router = express.Router();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Shared resourceOwnerFn for routes that check dataset ownership.
// Resolves the username of the dataset creator so the access-control middleware
// can compare it against req.user.username (own vs. any permission check).
//
// Returns null when no `action: 'create'` audit log exists for the dataset.
// This happens for datasets that were created before this branch introduced the
// audit-log write in buildDatasetCreateQuery().  Returning null (rather than
// throwing) is intentional: the access-control middleware in auth.js treats a
// null resourceOwner as "requester !== owner", which falls through to the
// update:any check.  Admins and operators have update:any on datasets and will
// still be granted access; regular users will receive a clean 403 instead of a
// 500.  Calling next(InternalServerError) here was wrong because it fires next
// twice when the access-control middleware later calls it again itself.
async function getDatasetCreatorUsername(req, res, next) {
  try {
    const creator = await datasetService.get_dataset_creator({
      dataset_id: parseInt(req.params.id, 10),
    });
    return creator.username;
  } catch (error) {
    logger.warn(
      '[AUTH] No create audit log found for dataset — dataset may pre-date '
      + 'the audit-log write introduced in this branch. '
      + 'Returning null so access-control falls back to update:any check.',
      { dataset_id: req.params.id, error: error.message },
    );
    return null;
  }
}

// Returns the dataset_upload_log for a given dataset (with the dataset relation
// included), or null if no log exists yet.
async function findUploadLogForDataset(datasetId) {
  return prisma.dataset_upload_log.findFirst({
    where: { dataset_id: datasetId },
    include: { dataset: true },
  });
}

// Reads the TUS sidecar (.json) file to extract the original filename and raw
// TUS metadata.  Falls back to sensible defaults when the sidecar is absent.
// Returns { originalFilename, tusMetadata }.
function readTusFileInfo({
  tusInfoPath, datasetId, process_id,
}) {
  let tusMetadata = {};
  let originalFilename = 'uploaded_file';

  if (fs.existsSync(tusInfoPath)) {
    const infoContent = fs.readFileSync(tusInfoPath, 'utf8');
    tusMetadata = JSON.parse(infoContent);
    originalFilename = tusMetadata.metadata?.filename
      || tusMetadata.metadata?.name
      || originalFilename;
    logger.info('[UPLOAD-COMPLETE] TUS metadata read', {
      dataset_id: datasetId,
      process_id,
      filename: originalFilename,
      metadata: tusMetadata.metadata,
    });
  } else {
    logger.warn('[UPLOAD-COMPLETE] TUS info file not found (using defaults)', {
      dataset_id: datasetId,
      process_id,
      expected_path: tusInfoPath,
    });
  }

  return { originalFilename, tusMetadata };
}

// Moves the raw TUS upload file to its final location under the dataset's
// origin_path.  Handles two upload modes:
//
//   - 'directory' mode: preserves relative directory structure under
//     origin_path/<directory_name>/<relative_path>
//   - single-file mode (default): places the file at
//     origin_path/<originalFilename>
//
// Operation is idempotent — if the file already exists at the destination the
// move is skipped.  Parent directories are created as needed.
// Returns the resolved final destination path.
function moveTusFileToDestination({
  tusFilePath,
  dataset,
  selection_mode,
  directory_name,
  relative_path,
  originalFilename,
  datasetId,
  process_id,
}) {
  const baseOriginPath = dataset.origin_path;
  let finalPath;

  if (selection_mode === 'directory' && relative_path) {
    const datasetUploadDir = path.join(baseOriginPath, directory_name || 'upload');
    finalPath = path.join(datasetUploadDir, relative_path);

    logger.info('[UPLOAD-COMPLETE] Directory upload mode', {
      dataset_id: datasetId,
      process_id,
      directory_name,
      relative_path,
      source: tusFilePath,
      destination: finalPath,
    });

    const parentDir = path.dirname(finalPath);
    if (!fs.existsSync(parentDir)) {
      logger.info('[UPLOAD-COMPLETE] Creating parent directory', {
        dataset_id: datasetId,
        parent_dir: parentDir,
      });
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } else {
    finalPath = path.join(baseOriginPath, originalFilename);

    logger.info('[UPLOAD-COMPLETE] Single file upload mode', {
      dataset_id: datasetId,
      process_id,
      filename: originalFilename,
      source: tusFilePath,
      destination: finalPath,
    });

    if (!fs.existsSync(baseOriginPath)) {
      logger.info('[UPLOAD-COMPLETE] Creating dataset directory', {
        dataset_id: datasetId,
        directory: baseOriginPath,
      });
      fs.mkdirSync(baseOriginPath, { recursive: true });
    }
  }

  if (!fs.existsSync(finalPath)) {
    logger.info('[UPLOAD-COMPLETE] Moving file', {
      dataset_id: datasetId,
      source: tusFilePath,
      destination: finalPath,
    });
    fs.renameSync(tusFilePath, finalPath);
    logger.info('[UPLOAD-COMPLETE] File moved successfully', {
      dataset_id: datasetId,
      destination: finalPath,
    });
  } else {
    logger.info('[UPLOAD-COMPLETE] File already exists at destination (idempotent)', {
      dataset_id: datasetId,
      destination: finalPath,
    });
  }

  return finalPath;
}

// Sets the dataset upload log status to UPLOAD_FAILED and records the failure
// reason in the log's metadata.  PROCESSING_FAILED is intentionally not used
// here: that status is reserved for failures that occur after the integrated
// workflow has started, so the background poller can safely restart it.  An
// error during the file-move step means the files may not be at origin_path,
// so triggering an automated workflow retry would be incorrect.  The UI shows
// a Retry button instead, allowing the user to re-call /complete.
// Errors during the status update are logged but not re-thrown so the caller's
// error response is not obscured.
async function markUploadAsFailed(datasetId, error) {
  try {
    logger.info('[UPLOAD-COMPLETE] Attempting to mark upload as failed', { dataset_id: datasetId });

    const existingLog = await prisma.dataset_upload_log.findFirst({
      where: { dataset_id: datasetId },
      select: { metadata: true },
    });

    await prisma.dataset_upload_log.updateMany({
      where: { dataset_id: datasetId },
      data: {
        status: CONSTANTS.UPLOAD_STATUSES.UPLOAD_FAILED,
        metadata: {
          ...(existingLog?.metadata || {}),
          failure_reason: error.message,
        },
      },
    });

    logger.info('[UPLOAD-COMPLETE] Upload marked as UPLOAD_FAILED', { dataset_id: datasetId });
  } catch (updateError) {
    logger.error('[UPLOAD-COMPLETE] Failed to update upload log status', {
      dataset_id: datasetId,
      error: updateError.message,
    });
  }
}

// ============================================================================
// LITERAL ROUTES (must come before parametrized routes like /:id)
// ============================================================================

// Returns uploads whose status has been stuck in UPLOADED, VERIFYING, or
// VERIFIED for more than 30 seconds.  The 30-second buffer avoids false
// positives for uploads that were just completed but haven't yet been picked
// up by a worker.
//
// Used by: Workers (manage_upload_workflows.py) for identifying stalled
// uploads that need to be re-triggered.
//
// Response:
//   - metadata.count: total number of stalled uploads
//   - uploads[]:      dataset_id, dataset_name, uploaded_at
router.get(
  '/stalled',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get stalled uploads needing processing'

    const stalledThreshold = new Date(Date.now() - 30 * 1000);

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

// Returns uploads that previously failed (PROCESSING_FAILED) and are still
// candidates for an automatic retry, filtered by:
//   - retry_count <= max_retry_count  (default: 2)
//   - updated_at >= now - max_age_hours  (default: 72 h)
//
// Used by: Workers (manage_upload_workflows.py) to build the list of failed
// uploads to re-submit for processing.
//
// Query params:
//   - max_retry_count  (optional, default 2):   skip uploads that have already
//     been retried this many times
//   - max_age_hours    (optional, default 72):   skip uploads older than this
//
// Response:
//   - uploads[]:  dataset_id, dataset_name, retry_count, last_error
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
        status: CONSTANTS.UPLOAD_STATUSES.PROCESSING_FAILED,
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

// Returns uploads that have remained in a given status for longer than a
// configurable number of days.  The default checks for UPLOADING sessions that
// appear to have been abandoned by the client.
//
// Used by: Workers (manage_upload_workflows.py) for detecting and cleaning up
// abandoned or zombie TUS upload sessions.
//
// Query params:
//   - status    (optional, default 'UPLOADING'):  the status to filter on
//   - age_days  (optional, default 7):            uploads older than this many
//     days are considered expired
//
// Response:
//   - uploads[]:  dataset_id, dataset_name, status, age_days
router.get(
  '/expired',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get expired uploads'

    const { status = CONSTANTS.UPLOAD_STATUSES.UPLOADING, age_days = 7 } = req.query;
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

// Returns every non-null process_id currently stored in upload logs.
//
// Used by: Workers to cross-reference against files present on disk in TUS
// storage, allowing detection and cleanup of orphaned TUS files that have no
// corresponding upload log.
//
// Response:
//   - process_ids[]:  all known process IDs
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

// Returns all upload logs whose status matches one or more of the provided
// values.  Primarily used by workers for bulk monitoring queries, e.g.
// "give me everything currently in VERIFYING or VERIFIED".
//
// Used by: Workers (manage_upload_workflows.py) for status-based monitoring
// and workflow re-triggering.
//
// Query params:
//   - statuses  (required):  one or more UPLOAD_STATUS values to filter by.
//     Pass as a repeated query parameter or as a comma-separated list depending
//     on the client.
//
// Response:
//   - uploads[]:  dataset_id, dataset_name, origin_path, status
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

// Returns a paginated list of all upload logs visible to the requester.
// Only logs that have a process_id are returned; rows without one are
// incomplete/orphaned and should not be surfaced.
//
// Used by: UI (upload history dashboard), Workers (bulk status queries).
//
// Query params (all optional):
//   - status        filter by a single UPLOAD_STATUS value
//   - dataset_name  case-insensitive substring match on the dataset name
//   - limit         max number of results to return
//   - offset        number of results to skip (for pagination)
//
// Response:
//   - metadata.count:  total matching records (before pagination)
//   - uploads[]:       full upload log records including dataset relation
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

    // Only show uploads that have a process_id (which indicates that upload was
    // registered at the database-level). This hides incomplete/orphaned uploads
    // from users.
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

// Returns a paginated list of upload logs for a specific user, identified by
// username.  Ownership is enforced: a regular user may only retrieve their own
// uploads, while admins/operators may query any user's uploads.
//
// Used by: UI (per-user upload history view).
//
// Path params:
//   - username  the username whose upload history to retrieve
//
// Query params (all optional):
//   - status        filter by a single UPLOAD_STATUS value
//   - dataset_name  case-insensitive substring match on the dataset name
//   - limit         max number of results to return
//   - offset        number of results to skip (for pagination)
//
// Response:
//   - metadata.count:  total matching records (before pagination)
//   - uploads[]:       full upload log records including dataset relation
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

// Registers a new dataset in the system in preparation for a TUS upload.
//
// This is the first call the UI makes when starting an upload.  It creates the
// dataset record, sets the deterministic origin_path where uploaded files will
// later be moved to, and creates a dataset_upload_log entry with status
// UPLOADING.  The returned upload log ID is used by the UI to correlate
// subsequent calls (e.g. POST /:id/complete) back to this dataset.
//
// Used by: UI (UploadDatasetStepper) at the beginning of a new upload session.
//
// Required body fields:
//   - type  dataset type (must be one of the configured dataset_types)
//   - name  dataset name (min 3 characters)
//
// Optional body fields:
//   - src_dataset_id    ID of a source dataset this upload is derived from
//   - project_id        project to associate the dataset with
//   - src_instrument_id instrument the data was collected on
//
// Response:
//   - the newly created dataset_upload_log record (with dataset relation)
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

    logger.info('[UPLOAD-CREATE] Starting dataset upload registration', {
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
        logger.info('[UPLOAD-CREATE] Dataset created', {
          dataset_id: createdDataset.id,
          dataset_name: createdDataset.name,
          dataset_type: createdDataset.type,
        });

        // Set origin_path to the predetermined location where uploaded files will be moved to.
        // This is deterministic and doesn't depend on the upload having been marked as
        // finished and/or the post-upload processing having been triggered.
        //
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

        logger.info('[UPLOAD-CREATE] Origin path set', {
          dataset_id: createdDataset.id,
          origin_path: datasetOriginPath,
        });

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

        logger.info('[UPLOAD-CREATE] Upload log created', {
          upload_log_id: created_dataset_upload_log.id,
          dataset_id: createdDataset.id,
          initial_status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
        });

        const updated_dataset_upload_log = await tx.dataset_upload_log.findUnique({
          where: { id: created_dataset_upload_log.id },
          include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
        });

        logger.info('[UPLOAD-CREATE] Transaction complete, returning upload log', {
          upload_log_id: updated_dataset_upload_log.id,
          dataset_id: createdDataset.id,
        });

        return updated_dataset_upload_log;
      });

      logger.info('[UPLOAD-CREATE] SUCCESS: Dataset upload registered', {
        upload_log_id: dataset_upload_log.id,
        dataset_id: dataset_upload_log.dataset.id,
        dataset_name: dataset_upload_log.dataset.name,
        user: req.user?.username,
      });

      res.json(dataset_upload_log);
    } catch (error) {
      logger.error('[UPLOAD-CREATE] FAILED: Error registering dataset upload', {
        user: req.user?.username,
        dataset_name: name,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }),
);

// Finalizes a TUS-based upload after the client signals that all file data has
// been transferred.  This is the second step of the two-step upload flow:
//   1. POST /  — registers the dataset and creates the upload log
//   2. POST /:id/complete  — moves files and marks the upload ready for processing
//
// Steps performed:
//   1. Looks up the dataset_upload_log for the dataset.
//   2. Short-circuits with success if the log is already in UPLOADED status
//      (idempotent — safe to call more than once).
//   3. Verifies the raw TUS file exists on disk.
//   4. Reads TUS sidecar metadata to obtain the original filename.
//   5. Moves the file from TUS staging to the dataset's origin_path,
//      preserving directory structure for directory-mode uploads.
//   6. Updates the upload log to UPLOADED and stores any caller-supplied
//      metadata (e.g. a manifest hash provided by the UI).
//   7. On any failure: marks the log as UPLOAD_FAILED.  PROCESSING_FAILED is
//      intentionally NOT used here because process_failed_uploads would then
//      try to restart an integrated workflow on a dataset whose files may never
//      have reached origin_path.  The UI Retry button re-calls this endpoint.
//
// Access control:
//   - The dataset creator may call this via update:own.
//   - Admins and operators may call this for any dataset via update:any.
//   - Regular users cannot call this for datasets they do not own.
//
// Used by: UI (UploadDatasetStepper) at the end of a TUS upload session.
//
// Path params:
//   - id  the dataset ID
//
// Required body fields:
//   - process_id      the TUS upload ID that identifies the staged file on disk
//
// Optional body fields:
//   - selection_mode   UI mode used ('directory' preserves relative paths)
//   - directory_name   root directory name for directory-mode uploads
//   - relative_path    relative file path within the directory (directory mode)
//   - metadata         arbitrary key/value pairs to merge into the upload log
//                      (e.g. { manifest_hash: '<hash>' } sent by the UI)
//
// Response:
//   - success:     true
//   - upload_log:  the updated upload log record (with dataset relation)
router.post(
  '/:id/complete',
  isPermittedTo('update', { checkOwnership: true }, getDatasetCreatorUsername),
  validate([
    body('process_id').isString().notEmpty(),
    body('selection_mode').optional().isString(),
    body('directory_name').optional().isString(),
    body('relative_path').optional().isString(),
    body('metadata').optional().isObject(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Mark TUS upload as complete and prepare for processing'

    const datasetId = parseInt(req.params.id, 10);
    const {
      process_id, selection_mode, directory_name, relative_path, metadata,
    } = req.body;

    logger.info('[UPLOAD-COMPLETE] Starting upload completion', {
      dataset_id: datasetId,
      process_id,
      selection_mode,
      directory_name,
      relative_path,
      has_metadata: !!metadata,
      user: req.user?.username,
    });

    try {
      const uploadLog = await findUploadLogForDataset(datasetId);

      if (!uploadLog) {
        logger.error('[UPLOAD-COMPLETE] FAILED: No upload log found', {
          dataset_id: datasetId,
          process_id,
          user: req.user?.username,
        });
        return res.status(404).json({ error: 'Upload log not found' });
      }

      logger.info('[UPLOAD-COMPLETE] Upload log found', {
        upload_log_id: uploadLog.id,
        dataset_id: datasetId,
        current_status: uploadLog.status,
        dataset_name: uploadLog.dataset.name,
      });

      if (uploadLog.status === CONSTANTS.UPLOAD_STATUSES.UPLOADED) {
        logger.info('[UPLOAD-COMPLETE] Idempotent request - already completed', {
          dataset_id: datasetId,
          upload_log_id: uploadLog.id,
          process_id,
        });
        return res.json({ success: true, upload_log: uploadLog });
      }

      const uploadPath = config.get('upload.path');
      const tusFilePath = path.join(uploadPath, process_id);
      const tusInfoPath = `${tusFilePath}.json`;

      if (!fs.existsSync(tusFilePath)) {
        logger.error('[UPLOAD-COMPLETE] FAILED: TUS file not found', {
          dataset_id: datasetId,
          process_id,
          expected_path: tusFilePath,
        });
        return res.status(404).json({ error: 'Upload file not found' });
      }

      logger.info('[UPLOAD-COMPLETE] TUS file found', {
        dataset_id: datasetId,
        process_id,
        tus_file_path: tusFilePath,
      });

      const { originalFilename } = readTusFileInfo({ tusInfoPath, datasetId, process_id });

      const stats = fs.statSync(tusFilePath);
      logger.info('[UPLOAD-COMPLETE] File size determined', {
        dataset_id: datasetId,
        process_id,
        file_size_bytes: stats.size,
        file_size_mb: (stats.size / (1024 * 1024)).toFixed(2),
      });

      const finalPath = moveTusFileToDestination({
        tusFilePath,
        dataset: uploadLog.dataset,
        selection_mode,
        directory_name,
        relative_path,
        originalFilename,
        datasetId,
        process_id,
      });

      logger.info('[UPLOAD-COMPLETE] File is ready', {
        dataset_id: datasetId,
        final_path: finalPath,
        origin_path: uploadLog.dataset.origin_path,
      });

      const updateData = {
        status: CONSTANTS.UPLOAD_STATUSES.UPLOADED,
        process_id,
        updated_at: new Date(),
      };

      // Merge caller-supplied metadata (e.g. manifest hash from the UI) into
      // any existing metadata fields already stored on the log.
      if (metadata) {
        logger.info('[UPLOAD-COMPLETE] Merging metadata', {
          dataset_id: datasetId,
          existing_metadata: uploadLog.metadata,
          new_metadata: metadata,
        });
        updateData.metadata = {
          ...(uploadLog.metadata || {}),
          ...metadata,
        };
      }

      logger.info('[UPLOAD-COMPLETE] Updating upload log', {
        dataset_id: datasetId,
        upload_log_id: uploadLog.id,
        new_status: CONSTANTS.UPLOAD_STATUSES.UPLOADED,
        process_id,
      });

      const updatedLog = await prisma.dataset_upload_log.update({
        where: { id: uploadLog.id },
        data: updateData,
        include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
      });

      logger.info('[UPLOAD-COMPLETE] SUCCESS: Upload completed', {
        dataset_id: datasetId,
        upload_log_id: updatedLog.id,
        dataset_name: updatedLog.dataset.name,
        status: updatedLog.status,
        process_id: updatedLog.process_id,
        user: req.user?.username,
      });

      res.json({ success: true, upload_log: updatedLog });
    } catch (error) {
      logger.error('[UPLOAD-COMPLETE] FAILED: Error completing upload', {
        dataset_id: datasetId,
        process_id,
        error: error.message,
        stack: error.stack,
        user: req.user?.username,
      });

      await markUploadAsFailed(datasetId, error);

      return res.status(500).json({ error: 'Failed to complete upload', details: error.message });
    }
  }),
);

// Updates the status of a dataset upload log.
//
// This is a lightweight status-transition endpoint.  It does not handle file
// operations; use POST /:id/complete for that.
//
// Access control mirrors POST /:id/complete:
//   - The dataset creator may update their own upload log (update:own).
//   - Admins and operators may update any upload log (update:any).
//   - Regular users cannot update logs for datasets they do not own.
//
// Used by: UI (to cancel or reset an upload), Workers (to advance status
// during post-upload processing stages).
//
// Path params:
//   - id  the dataset ID
//
// Optional body fields:
//   - status  the new UPLOAD_STATUS value to set
//
// Response:
//   - the updated dataset_upload_log record (with dataset relation)
router.patch(
  '/:id',
  isPermittedTo('update', { checkOwnership: true }, getDatasetCreatorUsername),
  validate([
    body('status').optional().trim().isIn(Object.values(CONSTANTS.UPLOAD_STATUSES)),
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['uploads']
    // #swagger.summary = 'Update the status of a dataset upload log'

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

// Returns the full dataset_upload_log record for a dataset, including a
// selected subset of the associated dataset fields (id, name, type,
// origin_path).
//
// This is the canonical endpoint workers use to read the current state of an
// upload before deciding what action to take next (e.g. which workflow to
// trigger, where the files live on disk).
//
// Used by: Workers (manage_upload_workflows.py, upload.py).
//
// Path params:
//   - id  the dataset ID
//
// Response:
//   - the dataset_upload_log record, including dataset { id, name, type, origin_path }
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

// Patches one or more fields on a dataset upload log: metadata, status, and/or
// retry_count.  Metadata is merged (not replaced) so callers can set
// individual fields without losing existing ones.
//
// Typical uses:
//   - Workers record a manifest hash after verifying file integrity:
//       PATCH { metadata: { manifest_hash: '<hash>' } }
//   - Workers advance the status through post-upload processing stages:
//       PATCH { status: 'VERIFYING' }
//   - Workers increment the retry counter after a failed attempt:
//       PATCH { retry_count: <n> }
//
// Used by: UI (to store the manifest hash computed client-side), Workers
// (to update status and metadata during post-upload processing).
//
// Path params:
//   - id  the dataset ID
//
// Optional body fields:
//   - metadata     key/value pairs to merge into the existing metadata object
//   - status       new UPLOAD_STATUS value
//   - retry_count  new retry counter value
//
// Response:
//   - success:     true
//   - upload_log:  the updated upload log record with dataset { id, name }
router.patch(
  '/:id/upload-log',
  isPermittedTo('update'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Update dataset upload log metadata, status, or retry count'

    const datasetId = parseInt(req.params.id, 10);
    const { metadata, status, retry_count } = req.body;

    logger.info('[UPLOAD-LOG-UPDATE] Updating upload log', {
      dataset_id: datasetId,
      has_metadata: !!metadata,
      new_status: status,
      new_retry_count: retry_count,
      user: req.user?.username,
    });

    const uploadLog = await prisma.dataset_upload_log.findFirst({
      where: {
        dataset_id: datasetId,
      },
    });

    if (!uploadLog) {
      logger.error('[UPLOAD-LOG-UPDATE] FAILED: Upload log not found', {
        dataset_id: datasetId,
        user: req.user?.username,
      });
      return res.status(404).json({ error: 'Upload log not found' });
    }

    logger.info('[UPLOAD-LOG-UPDATE] Upload log found', {
      upload_log_id: uploadLog.id,
      dataset_id: datasetId,
      current_status: uploadLog.status,
      current_retry_count: uploadLog.retry_count,
    });

    const updateData = {};

    if (metadata) {
      const existingMetadata = uploadLog.metadata || {};
      updateData.metadata = { ...existingMetadata, ...metadata };
      logger.info('[UPLOAD-LOG-UPDATE] Merging metadata', {
        dataset_id: datasetId,
        existing_metadata: existingMetadata,
        new_metadata: metadata,
        merged_metadata: updateData.metadata,
      });
    }

    if (status) {
      updateData.status = status;
      logger.info('[UPLOAD-LOG-UPDATE] Updating status', {
        dataset_id: datasetId,
        old_status: uploadLog.status,
        new_status: status,
      });
    }

    if (retry_count !== undefined) {
      updateData.retry_count = retry_count;
      logger.info('[UPLOAD-LOG-UPDATE] Updating retry count', {
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

    logger.info('[UPLOAD-LOG-UPDATE] SUCCESS: Upload log updated', {
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

// Returns a summary of upload details for a dataset.  The response is
// intentionally narrower than GET /:id/upload-log — it omits origin_path and
// returns only the fields needed for display in the UI's upload history view.
//
// Used by: UI (upload history detail panel), Workers (lightweight status
// reads that don't need the full dataset record).
//
// Path params:
//   - id  the dataset ID
//
// Response:
//   - id, status, process_id, retry_count, metadata, updated_at
//   - dataset { id, name, type }
router.get(
  '/:id/logs',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get upload details by dataset ID'

    const datasetId = parseInt(req.params.id, 10);

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

// Returns the current upload status and associated metadata for a dataset.
// Intended as a lightweight polling endpoint — the response mirrors
// GET /:id/logs but makes the status field the primary concern.
//
// Used by: UI (upload progress polling), Workers (status checks before
// deciding whether to re-trigger processing).
//
// Path params:
//   - datasetId  the dataset ID
//
// Response:
//   - status, process_id, retry_count, metadata, updated_at
//   - dataset { id, name, type }
router.get(
  '/:datasetId/status',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get upload status for a dataset'

    const datasetId = parseInt(req.params.datasetId, 10);

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
