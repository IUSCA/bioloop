const fs = require('fs');
const path = require('path');
const logger = require('@/services/logger');

/**
 * Reads the TUS sidecar (.json) file to extract the original filename and raw
 * TUS metadata. Throws if the sidecar is absent.
 *
 * Sidecar meaning:
 *   @tus/file-store keeps one JSON metadata file per upload ID
 *   (<process_id>.json) in TUS staging. It stores metadata sent at upload
 *   creation (dataset_id, filename, relative_path, selection_mode, etc).
 *   This app uses that metadata to determine where the uploaded payload file
 *   must be moved under dataset.origin_path.
 *
 * The old behavior silently fell back to `originalFilename = 'uploaded_file'`
 * when the sidecar was missing.  In a multi-file upload this caused every
 * sidecar-missing file to target the same destination path; the idempotent
 * move guard skipped all but the first, silently dropping the rest.  Throwing
 * here surfaces the problem immediately rather than allowing silent data loss.
 *
 * Returns { originalFilename, tusMetadata }.
 */
function readTusFileInfo({ tusInfoPath, datasetId, process_id }) {
  if (!fs.existsSync(tusInfoPath)) {
    const msg = `TUS sidecar not found — cannot determine filename for upload (process_id: ${process_id})`;
    logger.error(`[TUS] ${msg}`, {
      dataset_id: datasetId,
      process_id,
      expected_path: tusInfoPath,
    });
    throw new Error(msg);
  }

  const infoContent = fs.readFileSync(tusInfoPath, 'utf8');
  const tusMetadata = JSON.parse(infoContent);
  const originalFilename = tusMetadata.metadata?.filename
    || tusMetadata.metadata?.name
    || 'uploaded_file';

  logger.info('[TUS] Metadata read', {
    dataset_id: datasetId,
    process_id,
    filename: originalFilename,
  });

  return { originalFilename, tusMetadata };
}

/**
 * Moves the raw TUS upload file to its final location under the dataset's
 * origin_path.  Handles two upload modes:
 *
 *   - 'directory' mode: preserves relative directory structure under
 *     origin_path/<relative_path>  (relative_path has the root directory stripped)
 *   - single-file / 'files' mode: places the file at
 *     origin_path/<originalFilename>
 *
 * Operation is idempotent — if the file already exists at the destination the
 * move is skipped.  Parent directories are created as needed.
 *
 * Why/how this move happens:
 *   TUS initially writes bytes to a staging file named by upload ID
 *   (<uploadDir>/<process_id>). Once a file is complete, onUploadFinish calls
 *   this helper to atomically rename that staged file into the dataset's final
 *   origin_path layout (directory-preserving or single-file mode).
 * Returns the resolved final destination path.
 */
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
  let createdFromMissingTusDataFile = false;

  if (selection_mode === 'directory' && relative_path) {
    // relative_path has the root directory stripped on the client side, so files
    // land directly under origin_path preserving the inner directory structure.
    finalPath = path.join(baseOriginPath, relative_path);

    logger.info('[TUS] Directory upload mode', {
      dataset_id: datasetId,
      process_id,
      directory_name,
      relative_path,
      source: tusFilePath,
      destination: finalPath,
    });

    const parentDir = path.dirname(finalPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } else {
    finalPath = path.join(baseOriginPath, originalFilename);

    logger.info('[TUS] Single file upload mode', {
      dataset_id: datasetId,
      process_id,
      filename: originalFilename,
      source: tusFilePath,
      destination: finalPath,
    });

    if (!fs.existsSync(baseOriginPath)) {
      fs.mkdirSync(baseOriginPath, { recursive: true });
    }
  }

  if (!fs.existsSync(finalPath)) {
    if (fs.existsSync(tusFilePath)) {
      const stagedSize = fs.statSync(tusFilePath).size;
      if (stagedSize === 0) {
        // 0-byte upload: keep the staging placeholder in place for TUS's
        // immediate post-create lifecycle checks, and materialize the final
        // empty file via copy. A rename here removes the staging path and can
        // cause TUS to report "file for this url not found" for empty files.
        logger.info('[TUS] 0-byte staged file detected — copying (not renaming)', {
          dataset_id: datasetId,
          source: tusFilePath,
          destination: finalPath,
        });
        fs.copyFileSync(tusFilePath, finalPath);
      } else {
        // Normal case: TUS staged a non-empty data file — move it to final location.
        logger.info('[TUS] Moving file', {
          dataset_id: datasetId,
          source: tusFilePath,
          destination: finalPath,
          size_bytes: stagedSize,
        });
        fs.renameSync(tusFilePath, finalPath);
        logger.info('[TUS] File moved successfully', {
          dataset_id: datasetId,
          destination: finalPath,
        });
      }
    } else {
      // 0-byte file: @tus/file-store v1.4 normally creates an empty data file
      // on create(), but as a safety net handle the case where it doesn't.
      logger.info('[TUS] 0-byte file — creating empty file at destination', {
        dataset_id: datasetId,
        destination: finalPath,
      });
      fs.writeFileSync(finalPath, '');
      createdFromMissingTusDataFile = true;
    }
  } else {
    logger.info('[TUS] File already exists at destination (idempotent)', {
      dataset_id: datasetId,
      destination: finalPath,
    });
  }

  // @tus/server v1.6 PostHandler may call store.getUpload() after onUploadFinish
  // on POST create flow for 0-byte uploads. In that specific case there was no
  // staged data file to begin with, so create a placeholder for PostHandler's
  // immediate fs.stat(). For normal uploads finalized on PATCH, do NOT recreate
  // a placeholder — leaving a zero-byte file behind can confuse subsequent HEAD
  // offset checks and cause apparent "stuck at 0%" behavior.
  if (createdFromMissingTusDataFile && !fs.existsSync(tusFilePath)) {
    logger.info('[TUS] Recreating TUS staging placeholder (PostHandler expiry compat)', {
      dataset_id: datasetId,
      path: tusFilePath,
    });
    fs.writeFileSync(tusFilePath, '');
  }

  return finalPath;
}

module.exports = { readTusFileInfo, moveTusFileToDestination };
