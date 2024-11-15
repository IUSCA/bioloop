const express = require('express');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const multer = require('multer');
const createError = require('http-errors');
const { createHash } = require('node:crypto');
const config = require('config');

const logger = require('../services/logger');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

const UPLOAD_SCOPE = String(config.get('upload_scope'));

const getUploadPath = (uploadedEntityId) => path.join(
  config.upload_path.data_products,
  uploadedEntityId,
);

const getFileChunksStorageDir = (uploadedEntityId, fileUploadLogId) => path.join(
  getUploadPath(uploadedEntityId),
  'uploaded_chunks',
  fileUploadLogId,
);

const getFileChunkName = (fileChecksum, index) => `${fileChecksum}-${index}`;

const uploadFileStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    logger.info('Received request to persist file to filesystem');
    const chunkStorage = getFileChunksStorageDir(
      req.body.uploaded_entity_id,
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
      name, uploaded_entity_id, index, checksum, chunk_checksum,
    } = req.body;

    logger.info('Received request to accept file:');
    logger.info(`name: ${name}`);
    logger.info(`uploaded_entity_id: ${uploaded_entity_id}`);
    logger.info(`index: ${index}`);
    logger.info(`checksum: ${checksum}`);
    logger.info(`chunk_checksum: ${chunk_checksum}`);

    const request_scope = req.token?.scope || '';
    logger.info(`Request scope: ${request_scope}`);

    const hyphen_delimited_file_name = name.split(' ').join('-'); // replace whitespaces with hyphens
    const expected_scope = `${UPLOAD_SCOPE}:${hyphen_delimited_file_name}`;
    logger.info(`Expected scope: ${expected_scope}`);

    if (request_scope !== expected_scope) {
      logger.error('Request scope does not match expected scope');
      return next(createError.Forbidden(`Authorization token should have scope ${expected_scope} `
          + `for the contents of file ${name} to be uploaded`));
    }

    if (!uploaded_entity_id) {
      logger.error('Missing uploaded_entity_id in request body');
      return next(createError.BadRequest('Missing uploaded_entity_id in request body'));
    } if (!checksum) {
      logger.error('Missing checksum in request body');
      return next(createError.BadRequest('Missing checksum in request body'));
    } if (!chunk_checksum) {
      logger.error('Missing chunk_checksum in request body');
      return next(createError.BadRequest('Missing chunk_checksum in request body'));
    } if (Number.isNaN(index)) {
      logger.error('Invalid index in request body');
      return next(createError.BadRequest('Invalid index received in request body'));
    }

    const receivedFilePath = req.file.path;

    logger.info('Reading file', receivedFilePath);
    fs.readFile(receivedFilePath, (err, data) => {
      if (err) {
        logger.error(`Error reading file ${receivedFilePath}`);
        logger.error(err);
        throw err;
      }

      const evaluated_checksum = createHash('md5').update(data).digest('hex');
      logger.info(`Evaluated checksum: ${evaluated_checksum}`);
      if (evaluated_checksum !== chunk_checksum) {
        const checksumValidationError = `Evaluated checksum of uploaded chunk ${evaluated_checksum} does not match the expected checksum ${chunk_checksum} received in the request`;
        logger.error(checksumValidationError);
        return next(createError.BadRequest(checksumValidationError));
      }

      logger.info('Successfully wrote uploaded file to disk');
      res.sendStatus(200);
    });
  }),
);

module.exports = router;
