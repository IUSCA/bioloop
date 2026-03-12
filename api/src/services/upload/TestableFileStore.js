/**
 * TestableFileStore
 *
 * A thin wrapper around the standard TUS FileStore that can inject a
 * mid-upload failure for automated testing purposes.
 *
 * How it works
 * ------------
 * The failure is triggered by setting a flag in `global.tusFailureSimulation`
 * (a Map keyed by TUS upload ID) before the upload starts.  The flag is
 * consumed on first use so each upload ID can only be failed once.
 *
 * In practice the flag is set by the `X-Simulate-Failure` request header
 * which is intercepted by the TUS middleware.  The flag is only respected
 * in non-production environments.
 *
 * Failure behaviour
 * -----------------
 * When failure is active the first 1 MB of the file is written normally and
 * then the stream is forcibly destroyed with an error.  This exercises the
 * resumability path: the client must be able to re-connect, resume from the
 * last confirmed offset, and ultimately complete the upload.
 */

const { FileStore } = require('@tus/file-store');
const { Transform, pipeline } = require('stream');
const fs = require('fs');
const path = require('path');
const logger = require('@/services/logger');

// Bytes written before the simulated failure is triggered.
const FAILURE_THRESHOLD_BYTES = 1024 * 1024; // 1 MB

class TestableFileStore extends FileStore {
  constructor(options) {
    super(options);
    this.failureSimulationActive = false;
  }

  /**
   * Intercepts every chunk write.  When failure simulation is active for this
   * upload ID, the write is handled by a custom pipeline that stops after
   * FAILURE_THRESHOLD_BYTES.  Otherwise the call is forwarded to the parent
   * FileStore unchanged.
   */
  async write(stream, id, offset) {
    const shouldFail = this._shouldSimulateFailure(id);

    logger.info(`[TUS-FILESTORE] write() called for upload ${id}`, {
      uploadId: id,
      offset,
      shouldFail,
    });

    if (!shouldFail) {
      return super.write(stream, id, offset);
    }

    logger.warn(`[TUS-FILESTORE] Simulating mid-upload failure for upload ${id}`, {
      uploadId: id,
      offset,
    });

    const filePath = path.join(this.directory, id);

    const writable = fs.createWriteStream(filePath, {
      flags: offset > 0 ? 'r+' : 'w',
      start: offset,
    });

    let bytesWritten = 0;
    let cutoffTriggered = false;

    // Transform that passes through up to FAILURE_THRESHOLD_BYTES then destroys
    // itself, simulating a connection drop mid-stream.
    const cutoffTransform = new Transform({
      transform(chunk, encoding, callback) {
        logger.info('[TUS-FILESTORE] Transform processing chunk', {
          uploadId: id,
          chunkSize: chunk.length,
          bytesWritten,
          cutoffTriggered,
        });

        if (cutoffTriggered) {
          logger.warn('[TUS-FILESTORE] Cutoff already triggered, rejecting chunk', { uploadId: id });
          return callback(new Error('Simulated upload failure (test mode)'));
        }

        const remaining = FAILURE_THRESHOLD_BYTES - bytesWritten;

        if (remaining <= 0) {
          cutoffTriggered = true;
          return callback(new Error('Simulated upload failure (test mode)'));
        }

        if (chunk.length <= remaining) {
          bytesWritten += chunk.length;

          if (bytesWritten === FAILURE_THRESHOLD_BYTES) {
            cutoffTriggered = true;
            logger.info('[TUS-FILESTORE] Threshold reached exactly, will fail after this chunk', {
              uploadId: id,
              bytesWritten,
              threshold: FAILURE_THRESHOLD_BYTES,
            });
            // Destroy after the current chunk has been flushed downstream.
            setImmediate(() => {
              cutoffTransform.destroy(new Error('Simulated upload failure (test mode)'));
            });
          }

          return callback(null, chunk);
        }

        // Partial chunk: write only up to the threshold, then signal failure.
        const partial = chunk.subarray(0, remaining);
        bytesWritten += partial.length;
        cutoffTriggered = true;

        logger.info('[TUS-FILESTORE] Partial chunk written to reach threshold, will fail next tick', {
          uploadId: id,
          bytesWritten,
          threshold: FAILURE_THRESHOLD_BYTES,
          chunkSize: chunk.length,
          partialSize: partial.length,
        });

        setImmediate(() => {
          cutoffTransform.destroy(new Error('Simulated upload failure (test mode)'));
        });

        return callback(null, partial);
      },
    });

    logger.info('[TUS-FILESTORE] Starting failure-simulation pipeline', {
      uploadId: id,
      offset,
      filePath,
      threshold: FAILURE_THRESHOLD_BYTES,
    });

    return new Promise((resolve, reject) => {
      pipeline(stream, cutoffTransform, writable, (err) => {
        logger.info('[TUS-FILESTORE] Pipeline completed', {
          uploadId: id,
          hasError: !!err,
          errorMessage: err?.message,
          bytesWritten,
        });

        if (!err) {
          // The pipeline finished without being destroyed — this is unexpected
          // in simulation mode but we handle it gracefully.
          logger.warn('[TUS-FILESTORE] Simulation pipeline completed without error (unexpected)', {
            uploadId: id,
            bytesWritten,
          });
          return resolve(offset + bytesWritten);
        }

        logger.error(`[TUS-FILESTORE] SIMULATED FAILURE after writing ${bytesWritten} bytes`, {
          uploadId: id,
          bytesWritten,
          threshold: FAILURE_THRESHOLD_BYTES,
          error: err.message,
        });

        const simulatedError = new Error('Simulated upload failure (test mode)');
        simulatedError.status_code = 500;
        simulatedError.body = 'Simulated mid-upload network failure';
        reject(simulatedError);
      });
    });
  }

  /**
   * Returns true if failure simulation has been requested for this upload ID,
   * and clears the flag so the failure fires exactly once per upload.
   *
   * The global Map is lazily initialised here rather than at module load time
   * so it is only allocated when the feature is actually used.
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
      // Consume the flag so it only fires once.
      global.tusFailureSimulation.delete(id);
      logger.info(`[TUS-FILESTORE] Flag cleared for ${id}, will simulate failure`);
      return true;
    }

    return false;
  }
}

module.exports = TestableFileStore;
