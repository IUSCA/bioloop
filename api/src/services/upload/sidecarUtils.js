const fs = require('fs');
const path = require('path');
/**
 * Mirror one TUS sidecar JSON file into a dataset-specific folder.
 *
 * What is a TUS sidecar file?
 *   For each TUS upload ID, @tus/file-store keeps a sibling JSON file
 *   (<uploadId>.json) next to the staged data file. The JSON contains upload
 *   metadata used by this app (for example the original filename and dataset_id).
 *
 *   The TUS datastore writes sidecars into a flat staging directory keyed only
 *   by upload ID. After a file is finalized (onUploadFinish), we copy that
 *   sidecar to:
 *     <uploadDir>/uploaded_data/<datasetId>/<processId>.json
 *   so cleanup jobs can target one dataset's sidecars without scanning unrelated
 *   uploads or touching dataset payload directories.
 *
 * Why mirror it?
 *   - The source sidecar is intentionally kept in the TUS staging
 *   directory because @tus/server/@tus/file-store may still read it as part of
 *   the current request lifecycle.
 *
 * @param {Object} params
 * @param {string} params.uploadDir - Base TUS staging directory (upload.path).
 * @param {number|string} params.datasetId - Dataset ID used for sidecar subdirectory naming.
 * @param {string} params.processId - TUS upload ID for this file (without .json suffix).
 * @returns {{
 *   moved: boolean,
 *   reason?: string,
 *   deduped?: boolean,
 *   source: string,
 *   destination: string
 * }}
 */
function relocateSidecarForUpload({ uploadDir, datasetId, processId }) {
  const datasetIdStr = String(datasetId);
  const sidecarName = `${processId}.json`;
  const src = path.join(uploadDir, sidecarName);
  const sidecarDir = path.join(uploadDir, 'uploaded_data', datasetIdStr);
  const dst = path.join(sidecarDir, sidecarName);

  if (!fs.existsSync(src)) {
    // Idempotent retries are expected if a prior attempt already relocated it.
    return { moved: false, reason: 'source_missing', source: src, destination: dst };
  }

  fs.mkdirSync(sidecarDir, { recursive: true });

  if (fs.existsSync(dst)) {
    return { moved: true, deduped: true, source: src, destination: dst, action: 'already_exists' };
  }

  fs.copyFileSync(src, dst);
  return { moved: true, deduped: false, source: src, destination: dst, action: 'copied' };
}

module.exports = { relocateSidecarForUpload };
