const express = require('express');
const createError = require('http-errors');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const multer = require('multer');

const config = require('config');
const { createHash } = require('node:crypto');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.get('/health', (req, res) => { res.send('OK'); });
router.get('/favicon.ico', (req, res) => res.status(204));

// From this point on, all routes require authentication.
router.use(authenticate);

function remove_leading_slash(str) {
  return str?.replace(/^\/+/, '');
}

router.get('*', (req, res, next) => {
  const SCOPE_PREFIX = config.get('scope_prefix');

  const scopes = (req.token?.scope || '').split(' ');
  const downoad_scopes = scopes.filter((scope) => scope.startsWith(SCOPE_PREFIX));

  if (downoad_scopes.length === 0) {
    return next(createError.Forbidden('Invalid scope'));
  }

  const token_file_path = remove_leading_slash(downoad_scopes[0].slice(SCOPE_PREFIX.length));
  const req_path = remove_leading_slash(req.path);

  if (req_path === token_file_path) {
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
});

const UPLOAD_PATH = path.join(config.upload_path, 'datasets');

const getUploadPath = (datasetName) => path.join(
  UPLOAD_PATH,
  datasetName,
);

const getFileChunksStorageDir = (datasetName, fileChecksum) => path.join(
  getUploadPath(datasetName),
  'chunked_files',
  fileChecksum,
);

const getFileChunkName = (fileChecksum, index) => `${fileChecksum}-${index}`;

const uploadFileStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const chunkStorage = getFileChunksStorageDir(req.body.data_product_name, req.body.checksum);
    await fsPromises.mkdir(chunkStorage, {
      recursive: true,
    });
    cb(null, chunkStorage);
  },
  filename: (req, file, cb) => {
    cb(null, getFileChunkName(req.body.checksum, req.body.index));
  },
});

/**
 * Accepts a multipart/form-data request, validates the checksum of the bytes received, and upon
 * successful validation, writes the received bytes to the filesystem. Path of the file is
 * constructed from metadata fields present in the request body.
 */
router.post(
  '/file-chunk',
  multer({ storage: uploadFileStorage }).single('file'),
  asyncHandler(async (req, res, next) => {
    const {
      name, data_product_name, total, index, size, checksum, chunk_checksum,
    } = req.body;

    const UPLOAD_SCOPE = config.get('upload_scope');

    const scopes = (req.token?.scope || '').split(' ')
    console.log(`scopes: ${scopes}`)

    const has_upload_scope = scopes.find((scope) => scope === UPLOAD_SCOPE);
    console.log(`has_upload_scope: ${has_upload_scope}`)
  
    if (!has_upload_scope) {
      return next(createError.Forbidden('Invalid scope'));
    }
    console.log('passed scope check')
  

    if (!(data_product_name && checksum && chunk_checksum) || Number.isNaN(index)) {
      res.sendStatus(400);
    }

    // eslint-disable-next-line no-console
    console.log('Processing file piece...', data_product_name, name, total, index, size, checksum, chunk_checksum);

    const receivedFilePath = req.file.path;
    fs.readFile(receivedFilePath, (err, data) => {
      if (err) {
        throw err;
      }

      const evaluated_checksum = createHash('md5').update(data).digest('hex');
      if (evaluated_checksum !== chunk_checksum) {
        res.sendStatus(409).json('Expected checksum for chunk did not equal evaluated checksum');
        return;
      }

      res.sendStatus(200);
    });
  }),
);

module.exports = router;
