/**
 * TUS Upload Service
 *
 * Provides dataset file upload functionality using TUS protocol.
 *
 * Features:
 * - Resumable uploads (up to 100GB per file)
 * - Automatic cleanup of expired uploads (7 days)
 * - Support for single files, multiple files, and directories
 *
 * Note: Post-upload processing is handled by explicit /complete endpoints,
 * not TUS hooks, to avoid response stream conflicts with async operations.
 */

const { Server } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const { Transform } = require('stream');
const config = require('config');
const logger = require('@/services/logger');

/**
 * Custom FileStore that can simulate mid-upload failures for testing
 * Wraps the standard FileStore and intercepts write operations
 */
class TestableFileStore extends FileStore {
  constructor(options) {
    super(options);
    this.failureSimulationActive = false;
  }

  /**
   * Override write method to inject failure simulation
   */
  async write(stream, id, offset) {
    // Check if this upload should simulate failure (based on request context)
    const shouldFail = this._shouldSimulateFailure(id);
    
    logger.info(`[TUS-FILESTORE] write() called for upload ${id}`, {
      uploadId: id,
      offset,
      shouldFail,
    });
    
    if (shouldFail) {
      logger.warn(`[TUS-FILESTORE] Simulating mid-upload failure for upload ${id}`, {
        uploadId: id,
        offset,
      });
      
      const fs = require('fs');
      const path = require('path');
      const { pipeline, Transform } = require('stream');
      
      const failureThreshold = 1024 * 1024; // 1MB
      const filePath = path.join(this.directory, id);
      
      const writeable = fs.createWriteStream(filePath, {
        flags: offset > 0 ? 'r+' : 'w',
        start: offset,
      });
      
      let bytesWritten = 0;
      let cutoffTriggered = false;
      
      const cutoffTransform = new Transform({
        transform(chunk, encoding, callback) {
          logger.info(`[TUS-FILESTORE] Transform processing chunk`, {
            uploadId: id,
            chunkSize: chunk.length,
            bytesWritten,
            cutoffTriggered,
          });
          
          if (cutoffTriggered) {
            logger.warn(`[TUS-FILESTORE] Cutoff already triggered, rejecting chunk`, {
              uploadId: id,
            });
            return callback(new Error('Simulated upload failure (test mode)'));
          }
          
          const remaining = failureThreshold - bytesWritten;
          
          if (remaining <= 0) {
            cutoffTriggered = true;
            return callback(new Error('Simulated upload failure (test mode)'));
          }
          
          if (chunk.length <= remaining) {
            bytesWritten += chunk.length;
            
            if (bytesWritten === failureThreshold) {
              cutoffTriggered = true;
              logger.info(`[TUS-FILESTORE] Threshold reached exactly, will fail after this chunk`, {
                uploadId: id,
                bytesWritten,
                threshold: failureThreshold,
              });
              setImmediate(() => {
                cutoffTransform.destroy(new Error('Simulated upload failure (test mode)'));
              });
            }
            
            return callback(null, chunk);
          }
          
          const partial = chunk.subarray(0, remaining);
          bytesWritten += partial.length;
          cutoffTriggered = true;
          
          logger.info(`[TUS-FILESTORE] Partial chunk written to reach threshold, will fail next tick`, {
            uploadId: id,
            bytesWritten,
            threshold: failureThreshold,
            chunkSize: chunk.length,
            partialSize: partial.length,
          });
          
          setImmediate(() => {
            cutoffTransform.destroy(new Error('Simulated upload failure (test mode)'));
          });
          
          return callback(null, partial);
        }
      });
      
      logger.info(`[TUS-FILESTORE] Starting pipeline`, {
        uploadId: id,
        offset,
        filePath,
        threshold: failureThreshold,
      });
      
      return new Promise((resolve, reject) => {
        pipeline(stream, cutoffTransform, writeable, (err) => {
          logger.info(`[TUS-FILESTORE] Pipeline completed`, {
            uploadId: id,
            hasError: !!err,
            errorMessage: err?.message,
            bytesWritten,
          });
          
          if (!err) {
            logger.warn(`[TUS-FILESTORE] Simulation completed without error (unexpected)`, {
              uploadId: id,
              bytesWritten,
            });
            return resolve(offset + bytesWritten);
          }
          
          logger.error(`[TUS-FILESTORE] SIMULATED FAILURE after writing ${bytesWritten} bytes`, {
            uploadId: id,
            bytesWritten,
            threshold: failureThreshold,
            error: err.message,
          });
          
          const error = new Error('Simulated upload failure (test mode)');
          error.status_code = 500;
          error.body = 'Simulated mid-upload network failure';
          reject(error);
        });
      });
    }
    
    return super.write(stream, id, offset);
  }

  /**
   * Check if this upload should simulate failure
   * This is set by middleware based on X-Simulate-Failure header
   */
  _shouldSimulateFailure(id) {
    if (!global.tusFailureSimulation) {
      global.tusFailureSimulation = new Map();
    }
    
    const shouldFail = global.tusFailureSimulation.get(id);
    
    logger.info(`[TUS-FILESTORE] _shouldSimulateFailure check for ${id}`, {
      uploadId: id,
      flagExists: shouldFail !== undefined,
      shouldFail: !!shouldFail,
    });
    
    if (shouldFail) {
      global.tusFailureSimulation.delete(id);
      logger.info(`[TUS-FILESTORE] Flag cleared for ${id}, will simulate failure`);
      return true;
    }
    
    return false;
  }
}

class UploadService {
  constructor() {
    const uploadPath = config.get('upload.path');

    logger.info(`Initializing TUS Upload Service at: ${uploadPath}`);

    this.tusServer = new Server({
      path: '/api/uploads/files',
      maxSize: 100 * 1024 * 1024 * 1024, // 100 GB max file size
      relativeLocation: true,

      datastore: new TestableFileStore({
        directory: uploadPath,
        expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1000, // 7 days
      }),
      
      onResponseError: (req, res, err) => {
        logger.error(`[TUS] Response error on ${req.method} ${req.url}: ${err.message}`, {
          method: req.method,
          url: req.url,
          error: err.message,
          status_code: err.status_code || 500,
        });
      },
    });

    logger.info('TUS Upload Service initialized with testable FileStore');
  }

  /**
   * Get the TUS server instance for mounting in Express
   */
  getServer() {
    return this.tusServer;
  }
}

module.exports = new UploadService();
