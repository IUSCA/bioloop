const fs = require('fs');
const path = require('path');
const logger = require('@/services/logger');

/**
 * Reads the TUS sidecar (.json) file to extract the original filename and raw
 * TUS metadata.  Falls back to sensible defaults when the sidecar is absent.
 * Returns { originalFilename, tusMetadata }.
 */
function readTusFileInfo({ tusInfoPath, datasetId, process_id }) {
  let tusMetadata = {};
  let originalFilename = 'uploaded_file';

  if (fs.existsSync(tusInfoPath)) {
    const infoContent = fs.readFileSync(tusInfoPath, 'utf8');
    tusMetadata = JSON.parse(infoContent);
    originalFilename = tusMetadata.metadata?.filename
      || tusMetadata.metadata?.name
      || originalFilename;
    logger.info('[TUS] Metadata read', {
      dataset_id: datasetId,
      process_id,
      filename: originalFilename,
    });
  } else {
    logger.warn('[TUS] Info file not found (using defaults)', {
      dataset_id: datasetId,
      process_id,
      expected_path: tusInfoPath,
    });
  }

  return { originalFilename, tusMetadata };
}

/**
 * Moves the raw TUS upload file to its final location under the dataset's
 * origin_path.  Handles two upload modes:
 *
 *   - 'directory' mode: preserves relative directory structure under
 *     origin_path/<directory_name>/<relative_path>
 *   - single-file / 'files' mode: places the file at
 *     origin_path/<originalFilename>
 *
 * Operation is idempotent — if the file already exists at the destination the
 * move is skipped.  Parent directories are created as needed.
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

  if (selection_mode === 'directory' && relative_path) {
    const datasetUploadDir = path.join(baseOriginPath, directory_name || 'upload');
    finalPath = path.join(datasetUploadDir, relative_path);

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
      // Normal case: TUS staged a data file — move it to its final location.
      logger.info('[TUS] Moving file', {
        dataset_id: datasetId,
        source: tusFilePath,
        destination: finalPath,
      });
      fs.renameSync(tusFilePath, finalPath);
      logger.info('[TUS] File moved successfully', {
        dataset_id: datasetId,
        destination: finalPath,
      });
    } else {
      // 0-byte file: @tus/file-store v1.4 normally creates an empty data file
      // on create(), but as a safety net handle the case where it doesn't.
      logger.info('[TUS] 0-byte file — creating empty file at destination', {
        dataset_id: datasetId,
        destination: finalPath,
      });
      fs.writeFileSync(finalPath, '');
    }
  } else {
    logger.info('[TUS] File already exists at destination (idempotent)', {
      dataset_id: datasetId,
      destination: finalPath,
    });
  }

  // @tus/server v1.6 PostHandler calls store.getUpload() AFTER onUploadFinish
  // to add the Upload-Expires response header.  getUpload() calls fs.stat() on
  // the TUS staging data file — if we have already moved it the stat fails with
  // ENOENT and TUS turns that into a 410 Gone error sent back to the client.
  // Recreate an empty placeholder at the staging path so the stat succeeds.
  // TUS's own 7-day expiry sweep will clean it up later.
  // (The PatchHandler's expiry check explicitly skips complete uploads without
  // calling getUpload(), so this placeholder is only critical for 0-byte files
  // whose onUploadFinish fires during the POST creation request itself.)
  if (!fs.existsSync(tusFilePath)) {
    logger.info('[TUS] Recreating TUS staging placeholder (PostHandler expiry compat)', {
      dataset_id: datasetId,
      path: tusFilePath,
    });
    fs.writeFileSync(tusFilePath, '');
  }

  return finalPath;
}

module.exports = { readTusFileInfo, moveTusFileToDestination };
