/**
 * UploadService
 *
 * Wraps the TUS server instance and exposes it for mounting in Express.
 *
 * Configuration (api/config/default.json → upload.*)
 * ---------------------------------------------------
 *   upload.path               — filesystem directory where TUS stores in-progress
 *                               uploads.  Overrideable via UPLOAD_HOST_DIR env var.
 *   upload.max_file_size_bytes — hard per-file size cap enforced by TUS before any
 *                               data is written.  Overrideable via
 *                               UPLOAD_MAX_FILE_SIZE_BYTES env var.
 *                               The UI reads the same value from
 *                               VITE_UPLOAD_MAX_FILE_SIZE_BYTES for client-side
 *                               pre-validation.
 *
 * TUS expiry
 * ----------
 * Incomplete uploads are automatically expired after 7 days.  The expiry sweep
 * is handled by the TUS FileStore itself; no separate cron job is needed.
 *
 * FileStore selection
 * --------------------
 * In production a plain @tus/file-store FileStore is used — no simulation
 * code is loaded or reachable.  In non-production environments TestableFileStore
 * (a thin subclass) is used instead, enabling mid-upload failure injection via
 * the X-Simulate-Failure header for testing TUS resume logic.
 *
 * Authorization (onUploadCreate)
 * --------------------------------
 * Before TUS writes any bytes, onUploadCreate validates three things:
 *   1. dataset_id is present in the TUS metadata and matches a real upload log.
 *   2. The upload log is still in UPLOADING status (prevents re-uploading to a
 *      slot that has already been completed or failed).
 *   3. The requesting user created this dataset (or holds admin/operator role).
 * This mirrors the spirit of origin/main's scoped upload token — authorization
 * is enforced before any data lands on disk.
 *
 * Post-upload processing
 * ----------------------
 * TUS completion hooks are NOT used for post-upload processing.  Instead, the UI
 * calls POST /datasets/uploads/:id/complete explicitly after all chunks are
 * received.  This avoids response-stream conflicts that arise when async work is
 * triggered inside a TUS hook.
 */

const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const config = require('config');
const logger = require('@/services/logger');
const prisma = require('@/db');
const CONSTANTS = require('@/constants');
const datasetService = require('@/services/dataset');

// TestableFileStore is only loaded in non-production environments.
// In production a plain FileStore is used — no simulation code is loaded or
// reachable at all, eliminating the global-state risk entirely.
const isProduction = process.env.NODE_ENV === 'production';
// eslint-disable-next-line global-require
const DataStore = isProduction ? FileStore : require('./TestableFileStore');

// TUS expiry: incomplete uploads older than this are cleaned up automatically.
const UPLOAD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class UploadService {
  constructor() {
    const uploadPath = config.get('upload.path');
    const maxFileSizeBytes = config.get('upload.max_file_size_bytes');

    logger.info('Initializing TUS UploadService', {
      uploadPath,
      maxFileSizeBytes,
      expiryMs: UPLOAD_EXPIRY_MS,
    });

    this.tusServer = new Server({
      // Must match the Express mount path in app.js so TUS can build correct
      // Location headers for resumable upload URLs.
      path: '/api/uploads/files',

      // Hard per-file limit enforced before TUS accepts any data.  The matching
      // client-side limit lives in ui/src/config.js (upload.max_file_size_bytes).
      maxSize: maxFileSizeBytes,

      // Emit relative URLs in Location headers so the response works behind
      // a reverse proxy without needing to know the external hostname.
      relativeLocation: true,

      datastore: new DataStore({
        directory: uploadPath,
        expirationPeriodInMilliseconds: UPLOAD_EXPIRY_MS,
      }),

      /**
       * Authorization gate — fires before TUS writes any bytes for a new upload.
       *
       * req.user is already populated by the authenticate() call in
       * createTusMiddleware (tus.js) before tusServer.handle() is invoked, so
       * role and identity checks can be made synchronously here.
       *
       * Throwing { status_code, body } aborts the request; TUS surfaces this to
       * the client and nothing is written to disk.
       */
      onUploadCreate: async (req, upload) => {
        const datasetId = parseInt(upload.metadata?.dataset_id, 10);

        if (!datasetId || Number.isNaN(datasetId)) {
          logger.warn('[TUS] onUploadCreate: missing or invalid dataset_id in metadata', {
            user: req.user?.username,
            raw_dataset_id: upload.metadata?.dataset_id,
          });
          throw { status_code: 400, body: 'dataset_id is required in upload metadata' };
        }

        const uploadLog = await prisma.dataset_upload_log.findUnique({
          where: { dataset_id: datasetId },
        });

        if (!uploadLog) {
          logger.warn('[TUS] onUploadCreate: no upload log found', {
            dataset_id: datasetId,
            user: req.user?.username,
          });
          throw { status_code: 404, body: 'No upload log found for this dataset' };
        }

        if (uploadLog.status !== CONSTANTS.UPLOAD_STATUSES.UPLOADING) {
          logger.warn('[TUS] onUploadCreate: upload log not in UPLOADING state', {
            dataset_id: datasetId,
            status: uploadLog.status,
            user: req.user?.username,
          });
          throw {
            status_code: 409,
            body: `Upload is not in UPLOADING state (current: ${uploadLog.status})`,
          };
        }

        // Admins and operators may upload to any dataset.
        const isPrivileged = req.user?.roles?.some(
          (r) => ['admin', 'operator'].includes(r),
        );

        if (!isPrivileged) {
          // Regular users may only upload to datasets they created.
          const creator = await datasetService.get_dataset_creator({ dataset_id: datasetId });

          if (!creator || creator.id !== req.user?.id) {
            logger.warn('[TUS] onUploadCreate: user not authorized for this dataset', {
              dataset_id: datasetId,
              user_id: req.user?.id,
              creator_id: creator?.id,
            });
            throw { status_code: 403, body: 'Not authorized to upload to this dataset' };
          }
        }

        logger.info('[TUS] onUploadCreate: authorized', {
          dataset_id: datasetId,
          user: req.user?.username,
          privileged: isPrivileged,
        });
      },

      onResponseError: (req, res, err) => {
        logger.error(`[TUS] Response error on ${req.method} ${req.url}: ${err.message}`, {
          method: req.method,
          url: req.url,
          error: err.message,
          status_code: err.status_code || 500,
        });
      },
    });

    logger.info('TUS UploadService initialized');
  }

  /**
   * Returns the TUS Server instance for mounting in Express.
   *
   * Usage in app.js:
   *   app.all('/api/uploads/files*', uploadService.getServer().handle.bind(...))
   */
  getServer() {
    return this.tusServer;
  }
}

module.exports = UploadService;
