/**
 * UploadService
 *
 * Wraps the TUS server instance and exposes it for mounting in Express.
 *
 * Configuration (api/config/default.json → upload.*)
 * ---------------------------------------------------
 *   upload.path               — filesystem directory where TUS stores in-progress
 *                               uploads.
 *   upload.max_file_size_bytes — hard per-file size cap enforced by TUS before any
 *                               data is written.  Overridable via
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
 * Post-upload processing (onUploadFinish)
 * ----------------------------------------
 * Each file is moved from TUS staging to its final location under
 * dataset.origin_path as soon as TUS finishes receiving it (onUploadFinish
 * hook).  All routing metadata (selection_mode, relative_path, directory_name)
 * is already present in the TUS upload metadata sent by the UI, so no extra
 * round-trip is needed.
 *
 * After all files are moved the UI calls POST /datasets/uploads/:id/complete,
 * which is now a lightweight status + metadata update only (no file I/O).
 */

// eslint-disable-next-line import/no-unresolved
const { Server } = require('@tus/server');
// eslint-disable-next-line import/no-unresolved
const { FileStore } = require('@tus/file-store');
const path = require('path');
const config = require('config');
const logger = require('@/services/logger');
const prisma = require('@/db');
const CONSTANTS = require('@/constants');
const datasetService = require('@/services/dataset');
const { readTusFileInfo, moveTusFileToDestination } = require('./tusUtils');
const { relocateSidecarForUpload } = require('./sidecarUtils');

// TestableFileStore is only loaded in non-production environments.
// In production a plain FileStore is used — no simulation code is loaded or
// reachable at all, eliminating the global-state risk entirely.
const isProduction = process.env.NODE_ENV === 'production';
// eslint-disable-next-line global-require
const DataStore = isProduction ? FileStore : require('./TestableFileStore');

// TUS expiry: incomplete uploads older than this are cleaned up automatically.
const UPLOAD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Creates an Error that @tus/server translates into an HTTP error response.
 *
 * @tus/server reads .status_code and .body off the thrown value.  Throwing a
 * plain object satisfies TUS but triggers ESLint's no-throw-literal rule;
 * attaching those fields to a real Error instance satisfies both.
 *
 * @param {number} statusCode - HTTP status code to return to the client.
 * @param {string} body       - Response body text.
 */
function tusError(statusCode, body) {
  return Object.assign(new Error(body), { status_code: statusCode, body });
}

function isLockAcquiredError(err) {
  const msg = String(err?.message || err?.body || '').toLowerCase();
  return msg.includes('lock acquired');
}

/**
 * Convert a host-visible dataset origin path to the equivalent container path
 * used by this API process for local filesystem writes.
 */
function resolveWritableOriginPath(originPath, uploadHostPath, uploadPath) {
  if (!uploadHostPath) return originPath;

  const rel = path.relative(uploadHostPath, originPath);
  const isInsideHostBase = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));

  if (!isInsideHostBase) return originPath;
  if (!rel) return uploadPath;
  return path.join(uploadPath, rel);
}

class UploadService {
  constructor() {
    const uploadPath = config.get('upload.path');
    const uploadHostPath = config.get('upload.host_path');
    const maxFileSizeBytes = config.get('upload.max_file_size_bytes');

    logger.info('Initializing TUS UploadService', {
      uploadPath,
      uploadHostPath,
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
      onUploadCreate: async (req, res, upload) => {
        const datasetId = parseInt(upload.metadata?.dataset_id, 10);

        if (!datasetId || Number.isNaN(datasetId)) {
          logger.warn('[TUS] onUploadCreate: missing or invalid dataset_id in metadata', {
            user: req.user?.username,
            unparsed_dataset_id: upload.metadata?.dataset_id,
          });
          throw tusError(400, 'dataset_id is required in upload metadata');
        }

        const uploadLog = await prisma.dataset_upload_log.findUnique({
          where: { dataset_id: datasetId },
        });

        if (!uploadLog) {
          logger.warn('[TUS] onUploadCreate: no upload log found', {
            dataset_id: datasetId,
            user: req.user?.username,
          });
          throw tusError(404, 'No upload log found for this dataset');
        }

        if (uploadLog.status !== CONSTANTS.UPLOAD_STATUSES.UPLOADING) {
          logger.warn('[TUS] onUploadCreate: upload log not in UPLOADING state', {
            dataset_id: datasetId,
            status: uploadLog.status,
            user: req.user?.username,
          });
          throw tusError(409, `Upload is not in UPLOADING state (current: ${uploadLog.status})`);
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
            throw tusError(403, 'Not authorized to upload to this dataset');
          }
        }

        logger.info('[TUS] onUploadCreate: authorized', {
          dataset_id: datasetId,
          user: req.user?.username,
          privileged: isPrivileged,
        });

        return res;
      },

      /**
       * Fires once TUS has received all bytes for a single file upload.
       *
       * TUS stores two staging artifacts per upload ID:
       *   1) payload file:  <upload.path>/<process_id>
       *   2) sidecar JSON:  <upload.path>/<process_id>.json
       *
       * The sidecar carries upload metadata (dataset_id, filename,
       * selection_mode, relative_path, etc). We read it first, then:
       *   - mirror sidecar JSON into uploaded_data/<dataset_id>/ for cleanup
       *     organization (source sidecar is kept for TUS internals)
       *   - move the payload file to the dataset's final origin_path
       *
       * The UI sends routing metadata on the initial POST /uploads/files
       * request, so everything needed for the destination path is available
       * here during onUploadFinish.
       *
       * Throwing tusError() here aborts the TUS response with an HTTP error,
       * which the tus-js-client surfaces as an upload failure and may retry.
       */
      onUploadFinish: async (req, res, upload) => {
        const datasetId = parseInt(upload.metadata?.dataset_id, 10);
        const selection_mode = upload.metadata?.selection_mode;
        const relative_path = upload.metadata?.relative_path;
        const directory_name = upload.metadata?.directory_name;
        const process_id = upload.id;

        logger.info('[TUS] onUploadFinish: moving file to origin_path', {
          dataset_id: datasetId,
          process_id,
          selection_mode,
          relative_path,
          directory_name,
        });

        const uploadLog = await prisma.dataset_upload_log.findUnique({
          where: { dataset_id: datasetId },
          include: { dataset: true },
        });

        if (!uploadLog || !uploadLog.dataset) {
          logger.error('[TUS] onUploadFinish: no upload log or dataset found', { dataset_id: datasetId });
          throw tusError(404, 'No upload log found for this dataset');
        }

        const uploadDir = config.get('upload.path');
        const tusFilePath = path.join(uploadDir, process_id);
        const tusInfoPath = `${tusFilePath}.json`;

        const { originalFilename } = readTusFileInfo({ tusInfoPath, datasetId, process_id });
        
        // Mirror this sidecar metadata file into a dataset-specific folder
        // for cleanup organization while keeping the source sidecar in place.
        // - Canonical path where metadata file is stored by TUS:
        //    <uploadDir>/<processId>.json
        // - Additional dataset-scoped copy:
        //    <uploadDir>/uploaded_data/<datasetId>/<processId>.json
        const sidecarRelocation = relocateSidecarForUpload({
          uploadDir,
          datasetId,
          processId: process_id,
        });
        logger.info('[TUS] Sidecar relocation', {
          dataset_id: datasetId,
          process_id,
          ...sidecarRelocation,
        });

        // locate the host path (as opposed to the containerized path) for the uploaded file
        const writableOriginPath = resolveWritableOriginPath(
          uploadLog.dataset.origin_path,
          uploadHostPath,
          uploadPath,
        );

        moveTusFileToDestination({
          tusFilePath,
          dataset: { ...uploadLog.dataset, origin_path: writableOriginPath },
          selection_mode,
          directory_name,
          relative_path,
          originalFilename,
          datasetId,
          process_id,
        });

        logger.info('[TUS] onUploadFinish: file moved', {
          dataset_id: datasetId,
          process_id,
          origin_path: uploadLog.dataset.origin_path,
          writable_origin_path: writableOriginPath,
        });

        return res;
      },

      onResponseError: (req, res, err) => {
        // TUS-internal errors (ResponseError) carry `status_code` and `body`
        // rather than `message`, so log both to make diagnosis straightforward.
        const statusCode = err.status_code || 500;
        const lockContention = statusCode === 423 || isLockAcquiredError(err);
        const level = lockContention ? 'warn' : 'error';
        logger[level](
          `[TUS] Response error on ${req.method} ${req.url}: ${err.message ?? err.body ?? err}`,
          {
            method: req.method,
            url: req.url,
            error_message: err.message,
            error_body: err.body,
            status_code: statusCode,
            lock_contention: lockContention,
          },
        );
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
