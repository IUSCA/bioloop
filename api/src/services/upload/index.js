/**
 * Entry point for the upload service.
 *
 * Exports a single shared UploadService instance so the TUS server is
 * initialized exactly once regardless of how many modules require() this path.
 *
 * Consumers (e.g. api/src/app.js) can continue to require('@/services/upload')
 * unchanged — Node.js resolves the directory to this index.js automatically.
 */

const UploadService = require('./UploadService');

module.exports = new UploadService();
