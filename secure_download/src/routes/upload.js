const express = require('express');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const multer = require('multer');
const createError = require('http-errors');
const { createHash } = require('node:crypto');

const config = require('config');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

const getUploadPath = (datasetName) => path.join(
  config.upload_path.data_products,
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
 * Accepts a multipart/form-data request, validates the checksum of the bytes
 * received, and upon successful validation, writes the received bytes to the
 * filesystem. Path of the file is constructed from metadata fields present in
 * the request body.
 */
router.post(
  '/',
  multer({ storage: uploadFileStorage }).single('file'),
  asyncHandler(async (req, res, next) => {
    const {
      name, data_product_name, total, index, size, checksum, chunk_checksum,
    } = req.body;

    // eslint-disable-next-line no-console
    console.log('Processing file piece ...', data_product_name, name, total, index, size, checksum, chunk_checksum);

    const UPLOAD_SCOPE = String(config.get('upload_scope'));

    const scopes = (req.token?.scope || '').split(' ');

    const matching_scopes = scopes.filter((scope) => scope === `${UPLOAD_SCOPE}:${name}`);

    if (matching_scopes.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Expected one, but found no matching scopes');
      return next(createError.Forbidden('Expected one, but found no matching scopes'));
    }
    if (matching_scopes.length > 1) {
      // eslint-disable-next-line no-console
      console.log('Expected one, but found multiple matching scopes');
      return next(createError.Forbidden('Expected one, but found multiple matching scopes'));
    }

    if (!(data_product_name && checksum && chunk_checksum) || Number.isNaN(index)) {
      res.sendStatus(400);
    }

    const receivedFilePath = req.file.path;
    fs.readFile(receivedFilePath, (err, data) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.log('Error reading file:', err);
        throw err;
      }

      const evaluated_checksum = createHash('md5').update(data).digest('hex');
      if (evaluated_checksum !== chunk_checksum) {
        // eslint-disable-next-line no-console
        console.log('Evaluated checksum of chunk does not match checksum received in the request');
        return next(createError.BadRequest('Evaluated checksum of chunk does not match checksum received in the request'));
      }
      // eslint-disable-next-line no-console
      console.log('checksums match');
      // eslint-disable-next-line no-console
      console.log('writing file...');
      res.sendStatus(200);
    });
  }),
);

// router.get(
//   '/test',
//   asyncHandler(async (req, res, next) => {
//     res.send('OK');
//   }))

module.exports = router;
