const express = require('express');
const createError = require('http-errors');
const config = require('config');
const { param } = require('express-validator');

const { validate } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');

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
    console.log('inside /download/:bundle_name');
    const SCOPE_PREFIX = config.get('scope_prefix');

    const scopes = (req.token?.scope || '').split(' ');
    const download_scopes = scopes.filter((scope) => scope.startsWith(SCOPE_PREFIX));

    if (download_scopes.length === 0) {
      return next(createError.Forbidden('Invalid scope'));
    }

    const token_file_path = remove_leading_slash(download_scopes[0].slice(SCOPE_PREFIX.length));
    const req_path = remove_leading_slash(req.path);

    if (req_path === token_file_path) {
      res.set('X-Accel-Redirect', `/data/${token_file_path}`);

      // make browser download response instead of attempting to render it
      res.set('content-type', 'application/octet-stream; charset=utf-8');
      const filename = token_file_path.split('/').pop();
      res.set('Content-Disposition', `attachment; filename="${filename}"`);

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
