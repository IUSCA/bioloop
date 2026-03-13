/**
 * Returns the TUS upload server URL for the given origin.
 *
 * Must match the `path` configured in UploadService.js on the API side
 * (`/api/uploads/files`).
 */
export function _getUploadServiceURL(origin) {
  return `${origin}/api/uploads/files`;
}
