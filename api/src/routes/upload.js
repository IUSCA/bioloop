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

const UPLOAD_SCOPE = 'upload_file:';
const UPLOAD_PATH = '/opt/sca/uploads/data_products';

const getUploadPath = (datasetId) => path.join(
  UPLOAD_PATH,
  datasetId,
);

const getFileChunksStorageDir = (datasetId, fileUploadLogId) => path.join(
  getUploadPath(datasetId),
  'chunked_files',
  fileUploadLogId,
);

const getFileChunkName = (fileChecksum, index) => `${fileChecksum}-${index}`;

const uploadFileStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const chunkStorage = getFileChunksStorageDir(
      req.body.data_product_id,
      req.body.file_upload_log_id,
    );
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
      name, data_product_id, index, checksum, chunk_checksum,
    } = req.body;

    const request_scope = req.token?.scope || '';

    const hyphen_delimited_file_name = name.split(' ').join('-'); // replace whitespaces with hyphens
    const expected_scope = `${UPLOAD_SCOPE}:${hyphen_delimited_file_name}`;

    if (request_scope !== expected_scope) {
      return next(createError.Forbidden(`Authorization token should have scope ${expected_scope} `
          + `for the contents of file ${name} to be uploaded`));
    }

    if (!(data_product_id && checksum && chunk_checksum) || Number.isNaN(index)) {
      return next(createError.BadRequest());
    }

    const receivedFilePath = req.file.path;
    fs.readFile(receivedFilePath, (err, data) => {
      if (err) {
        throw err;
      }

      const evaluated_checksum = createHash('md5').update(data).digest('hex');
      if (evaluated_checksum !== chunk_checksum) {
        return next(createError.BadRequest('Evaluated checksum of chunk does not match checksum received in the request'));
      }
      res.sendStatus(200);
    });
  }),
);

module.exports = router;
