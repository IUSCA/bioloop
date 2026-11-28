const express = require('express');
const createError = require('http-errors');
const config = require('config');
const { param } = require('express-validator');
const path = require('path');
const fs = require('fs');

const { validate } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

function remove_leading_slash(str) {
  return str?.replace(/^\/+/, '');
}

function decode_file_path(file_path) {
  let decoded_path;
  try {
    decoded_path = decodeURIComponent(remove_leading_slash(file_path));
  } catch (err) {
    throw createError.BadRequest('Invalid path encoding');
  }

  const segments = decoded_path.split('/');
  const has_unsafe_segment = segments.some((segment) => ['', '.', '..'].includes(segment));
  if (!decoded_path || decoded_path.includes('\\') || decoded_path.includes('\0')
    || has_unsafe_segment) {
    throw createError.Forbidden('Invalid path');
  }

  return decoded_path;
}

function encode_file_path(file_path) {
  return file_path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Get a stream of the file at the given path
 * @param {string} filePath - The path to the file to stream
 * @returns {fs.ReadStream} - A stream of the file
 */
function getFileStream(filePath) {
  const _filePath = path.join(config.get('download_path'), filePath);
  if (!fs.existsSync(_filePath)) {
    throw createError.NotFound('File not found');
  }
  const stream = fs.createReadStream(_filePath);
  stream.on('error', (err) => {
    console.error('Error streaming file:', err);
    throw createError.InternalServerError('Error downloading file');
  });
  return stream;
}

router.get(
  '/:file_path*',
  validate([
    param('file_path').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    const SCOPE_PREFIX = config.get('scope_prefix');

    const scopes = (req.token?.scope || '').split(' ');
    const download_scopes = scopes.filter((scope) => scope.startsWith(SCOPE_PREFIX));

    if (download_scopes.length === 0) {
      return next(createError.Forbidden('Invalid scope'));
    }

    const token_file_path = decode_file_path(
      download_scopes[0].slice(SCOPE_PREFIX.length),
    );
    const req_path = decode_file_path(req.path);

    if (req_path === token_file_path) {
      // make browser download response instead of attempting to render it
      res.set('content-type', 'application/octet-stream; charset=utf-8');

      if (config.get('mode') !== 'production') {
        // In docker/dev/local/test mode, directly stream the file using Express
        const stream = getFileStream(token_file_path);
        stream.pipe(res);
      } else {
        // In production mode, use nginx X-Accel-Redirect
        res.set('X-Accel-Redirect', `/data/${encode_file_path(token_file_path)}`);

        // makes nginx not cache the response file
        // otherwise the response cuts off at 1GB as the max buffer size is reached
        // and the file download fails
        // https://stackoverflow.com/a/64282626
        res.set('X-Accel-Buffering', 'no');
        res.send('');
      }
    } else {
      return next(createError.Forbidden('Invalid path'));
    }
  }),
);

router.use((err, req, res, next) => {
  if (err instanceof URIError) {
    return next(createError.BadRequest('Invalid path encoding'));
  }
  return next(err);
});

module.exports = router;
