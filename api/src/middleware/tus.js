const logger = require('@/services/logger');
const { authenticate } = require('@/middleware/auth');

/**
 * Handle failure simulation for testing TUS upload resume logic.
 *
 * Only active in non-production environments (NODE_ENV !== 'production').
 * In production this function is a no-op regardless of any headers sent by
 * the client, so the simulation surface cannot be triggered accidentally or
 * maliciously on live data.
 *
 * Usage: Add header 'X-Simulate-Failure: mid-upload' to trigger failure after writing ~1MB
 * Optional: Add header 'X-Simulate-Failure-Count: N' to fail N times (default: 1)
 *
 * @param {Object} req - Express request object
 * @param {string} uploadId - TUS upload ID
 */
function handleFailureSimulation(req, uploadId) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const hasUploadData = req.headers['content-length'] && parseInt(req.headers['content-length'], 10) > 0;
  const shouldSimulateFailure = req.headers['x-simulate-failure'] === 'mid-upload'
                                  && req.method === 'PATCH'
                                  && hasUploadData;

  if (!shouldSimulateFailure) {
    return;
  }

  if (!global.tusFailureSimulation) {
    global.tusFailureSimulation = new Map();
  }
  if (!global.tusFailureSimulationCount) {
    global.tusFailureSimulationCount = new Map();
  }

  const MAX_FAILURES = parseInt(req.headers['x-simulate-failure-count'] || '1', 10);
  const currentFailCount = global.tusFailureSimulationCount.get(uploadId) || 0;

  if (currentFailCount < MAX_FAILURES) {
    logger.warn(`[TUS] Marking upload ${uploadId} for failure simulation `
      + `(attempt ${currentFailCount + 1}/${MAX_FAILURES})`, {
      uploadId,
      method: req.method,
      contentLength: req.headers['content-length'],
      failuresRemaining: MAX_FAILURES - currentFailCount,
    });

    global.tusFailureSimulation.set(uploadId, true);
    global.tusFailureSimulationCount.set(uploadId, currentFailCount + 1);
  } else {
    logger.info(`[TUS] Upload ${uploadId} has exhausted failure quota `
      + `(${currentFailCount} failures), allowing retry to proceed`, {
      uploadId,
      maxFailures: MAX_FAILURES,
    });
  }
}

/**
 * TUS Upload Server Middleware
 *
 * Handles authentication, logging, and failure-simulation for TUS resumable uploads.
 * Must be mounted BEFORE other Express middleware to intercept requests.
 *
 * @param {Object} tusServer - The TUS server instance from UploadService
 * @returns {Function} Express middleware function
 */
function createTusMiddleware(tusServer) {
  return (req, res, next) => {
    // Two forms of the TUS path can arrive here:
    // - '/uploads/files'      — request was forwarded by a reverse proxy (e.g. Nginx) that
    //                           stripped the '/api' prefix before passing it to this Node process.
    // - '/api/uploads/files'  — request reached Node directly (e.g. in local dev), with the
    //                           full prefix intact.
    const isTusPath = req.path.startsWith('/uploads/files') || req.path.startsWith('/api/uploads/files');

    if (!isTusPath) {
      logger.warn(`[TUS] Not a TUS path: ${req.path}`, {
        path: req.path,
        isTusPath,
      });
      return next();
    }

    const isNewUpload = req.method === 'POST';
    const uploadId = isNewUpload ? null : req.path.split('/').pop();

    logger.info(`[TUS] ${req.method} ${req.path}`, {
      uploadId,
      contentLength: req.headers['content-length'],
      contentType: req.headers['content-type'],
      uploadOffset: req.headers['upload-offset'],
      uploadLength: req.headers['upload-length'],
      tusResumable: req.headers['tus-resumable'],
    });

    authenticate(req, res, (err) => {
      if (err) {
        logger.error(`[TUS] Authentication failed for ${req.method} ${req.path}:`, {
          error: err.message,
          uploadId,
        });
        return next(err);
      }

      logger.info(`[TUS] Authentication successful for user: ${req.user?.username || 'unknown'}`);

      // No-op in production. In non-production environments, an authenticated
      // client can set X-Simulate-Failure: mid-upload to trigger server-side
      // failure simulation for testing TUS resume logic.
      handleFailureSimulation(req, uploadId);

      // True when the reverse proxy stripped '/api' before forwarding (see isTusPath comment above).
      // The TUS server is registered at '/api/uploads/files', so the prefix must be restored
      // before handing the request off, otherwise TUS won't match the path and will reject it.
      if (!req.url.startsWith('/api/uploads/files')) {
        req.url = `/api${req.url}`;
      }

      // Intercept res.end and res.writeHead to log the outcome after TUS sends its response.
      // A normal 'finish' event listener won't work here because TUS bypasses Express's response
      // pipeline and writes directly to the socket via these two methods. The originals are saved
      // so the wrappers can call through to them and the actual response is still sent.
      const originalEnd = res.end;
      const originalWriteHead = res.writeHead;
      let statusCode = 200;

      res.writeHead = function writeHead(...args) {
        [statusCode] = args;
        return originalWriteHead.apply(this, args);
      };

      res.end = function end(...args) {
        const isSuccess = statusCode >= 200 && statusCode < 300;
        const logLevel = isSuccess ? 'info' : 'error';

        logger[logLevel](`[TUS] ${req.method} ${req.path} completed`, {
          statusCode,
          uploadId,
          user: req.user?.username,
          success: isSuccess,
        });

        return originalEnd.apply(this, args);
      };

      return tusServer.handle(req, res);
    });
  };
}

module.exports = createTusMiddleware;
