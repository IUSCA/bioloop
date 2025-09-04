const express = require('express');
const createError = require('http-errors');
const config = require('config');
const { param } = require('express-validator');
const fs = require('fs');
const path = require('path');

const { validate } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../services/logger');

const router = express.Router();

function remove_leading_slash(str) {
  return str?.replace(/^\/+/, '');
}

// The trailing * ensures that this route can accept a file's path as a string after
// the dataset's bundle name, in case a specific file is being requested for download.
router.get(
  '/:bundle_name*',
  validate([
    param('bundle_name').escape().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    logger.info('inside /download/:bundle_name');
    const SCOPE_PREFIX = config.get('scope_prefix');

    const scopes = (req.token?.scope || '').split(' ');
    const download_scopes = scopes.filter((scope) => scope.startsWith(SCOPE_PREFIX));

    if (download_scopes.length === 0) {
      return next(createError.Forbidden('Invalid scope'));
    }

    const token_file_path = remove_leading_slash(download_scopes[0].slice(SCOPE_PREFIX.length));
    const req_path = remove_leading_slash(req.path);

    if (req_path === token_file_path) {
      logger.info('req_path === token_file_path');
      logger.info(`req_path: ${req_path}`);
      logger.info(`token_file_path: ${token_file_path}`);

      // Get and print the size of the token file path
      const fullFilePath = path.join('/opt/sca/data/downloads/', token_file_path);
      try {
        const stats = fs.statSync(fullFilePath);
        logger.info(`File size: ${stats.size} bytes`);

        // Check if we're in Docker mode (NODE_ENV === 'docker')
        if (process.env.NODE_ENV === 'docker') {
          logger.info('Docker mode detected, serving file directly with Express');

          // Set headers for file download
          res.set('content-type', 'application/octet-stream; charset=utf-8');

          // Create read stream and pipe to response
          const fileStream = fs.createReadStream(fullFilePath);
          fileStream.pipe(res);

          fileStream.on('error', (error) => {
            logger.error(`Error streaming file: ${error.message}`);
            if (!res.headersSent) {
              res.status(500).send('Error streaming file');
            }
          });

          return; // Exit early, don't send X-Accel-Redirect
        }
      } catch (error) {
        logger.error(`Error getting file size: ${error.message}`);
      }

      // Production mode: use nginx X-Accel-Redirect
      logger.info('Production mode detected, using nginx X-Accel-Redirect');
      res.set('X-Accel-Redirect', `/data/${token_file_path}`);

      // make browser download response instead of attempting to render it
      res.set('content-type', 'application/octet-stream; charset=utf-8');

      // makes nginx not cache the response file
      // otherwise the response cuts off at 1GB as the max buffer size is reached
      // and the file download fails
      // https://stackoverflow.com/a/64282626
      res.set('X-Accel-Buffering', 'no');
      res.send('');
    } else {
      return next(createError.Forbidden('Invalid path'));
    }
  }),
);

module.exports = router;
