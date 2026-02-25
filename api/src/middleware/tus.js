const logger = require('@/services/logger');
const { authenticate } = require('@/middleware/auth');

/**
 * Handle failure simulation for testing TUS upload resume logic.
 *
 * TEST ONLY: Marks upload for mid-upload failure at FileStore level.
 * Configurable to fail N times before allowing success.
 *
 * Usage: Add header 'X-Simulate-Failure: mid-upload' to trigger failure after writing ~1MB
 * Optional: Add header 'X-Simulate-Failure-Count: N' to fail N times (default: 1)
 *
 * @param {Object} req - Express request object
 * @param {string} uploadId - TUS upload ID
 */
function handleFailureSimulation(req, uploadId) {
  const hasUploadData = req.headers['content-length'] && parseInt(req.headers['content-length'], 10) > 0;
  const shouldSimulateFailure = req.headers['x-simulate-failure'] === 'mid-upload'
                                  && req.method === 'PATCH'
                                  && hasUploadData;

  if (!shouldSimulateFailure || uploadId === 'files') {
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
    logger.warn(`[TUS] Marking upload ${uploadId} for mid-upload failure simulation (attempt ${currentFailCount + 1}/${MAX_FAILURES})`, {
      uploadId,
      method: req.method,
      contentLength: req.headers['content-length'],
      failuresRemaining: MAX_FAILURES - currentFailCount,
    });

    global.tusFailureSimulation.set(uploadId, true);
    global.tusFailureSimulationCount.set(uploadId, currentFailCount + 1);
  } else {
    logger.info(`[TUS] Upload ${uploadId} has exhausted failure quota (${currentFailCount} failures), allowing retry to proceed`, {
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
    const isTusPath = req.path.startsWith('/uploads/files') || req.path.startsWith('/api/uploads/files');

    if (!isTusPath) {
      logger.warn(`[TUS] Not a TUS path: ${req.path}`, {
        path: req.path,
        isTusPath,
      });
      return next();
    }

    const uploadId = req.path.split('/').pop();

    logger.info(`[TUS] ${req.method} ${req.path}`, {
      uploadId: uploadId !== 'files' ? uploadId : 'NEW',
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
          uploadId: uploadId !== 'files' ? uploadId : 'NEW',
        });
        return next(err);
      }

      logger.info(`[TUS] Authentication successful for user: ${req.user?.username || 'unknown'}`);

      handleFailureSimulation(req, uploadId);

      if (!req.url.startsWith('/api/uploads/files')) {
        req.url = `/api${req.url}`;
      }

      const originalEnd = res.end;
      const originalWriteHead = res.writeHead;
      let statusCode = 200;

      res.writeHead = function (...args) {
        statusCode = args[0];
        return originalWriteHead.apply(this, args);
      };

      res.end = function (...args) {
        const isSuccess = statusCode >= 200 && statusCode < 300;
        const logLevel = isSuccess ? 'info' : 'error';

        logger[logLevel](`[TUS] ${req.method} ${req.path} completed`, {
          statusCode,
          uploadId: uploadId !== 'files' ? uploadId : 'NEW',
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
