// This module is a sub router for handling file-related routes for datasets.
// req.params.dataset_id is expected to be present in all routes, and is validated in the parent router (index.js).

const express = require('express');
const { param, query, body } = require('express-validator');
const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const datasetFileService = require('@/services/datasets_v2/files');

const router = express.Router();

// All routes in this sub-router authorize against the parent dataset.
// Because req.params.id is not set in sub-routers, we supply dataset_id explicitly.
const byDatasetId = { resourceIdFn: (req) => req.params.dataset_id };

const FILE_TYPES = ['file', 'directory', 'symbolic link'];

// add files to dataset
router.post(
  '/',
  validate([
    body().isArray({ min: 1 }),
    body('*.path').isString().isLength({ min: 1 }),
    body('*.size').isInt({ min: 0 }),
    body('*.md5').isString().isLength({ min: 1 }),
    body('*.type').isIn(FILE_TYPES),
  ]),
  authorize('dataset', 'edit', byDatasetId),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Associate files to a dataset
    const data = req.body.map((f) => ({
      path: f.path,
      md5: f.md5,
      size: BigInt(f.size),
      filetype: f.type,
    }));

    await datasetFileService.addFilesToDataset({
      dataset_id: req.params.dataset_id,
      data,
    });

    res.status(204).send();
  }),
);

// get files for a dataset (directory listing)
router.get(
  '/',
  validate([
    query('basepath').default(''),
  ]),
  authorize('dataset', 'list_files', byDatasetId),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get a list of files and directories under basepath
    const files = await datasetFileService.listFiles({
      dataset_id: req.params.dataset_id,
      base: req.query.basepath,
    });

    res.json(files);
  }),
);

// get file tree for a dataset
router.get(
  '/tree',
  authorize('dataset', 'list_files', byDatasetId),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get the file tree for a dataset
    const tree = await datasetFileService.getFileTree({
      dataset_id: req.params.dataset_id,
    });

    res.json(tree);
  }),
);

// search files in a dataset
router.get(
  '/search',
  validate([
    query('name').default(''),
    query('basepath').default(''),
    query('filetype').isIn(FILE_TYPES).optional(),
    query('extension').optional(),
    query('min_file_size').isInt().toInt().optional(),
    query('max_file_size').isInt().toInt().optional(),
    query('sort_by').default('name').isIn(['name', 'size']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
    query('skip').default(0).isInt().toInt(),
    query('take').default(1000).isInt().toInt(),
  ]),
  authorize('dataset', 'list_files', byDatasetId),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Search files in a dataset
    const files = await datasetFileService.searchFiles({
      dataset_id: req.params.dataset_id,
      base: req.query.basepath,
      ..._.omitBy(_.isUndefined)(req.query),
    });
    res.json(files);
  }),
);

// get download info for dataset as a bundle (e.g. zip / tar)
router.get(
  '/bundle/download_info',
  authorize('dataset', 'download', byDatasetId),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get download info for the entire dataset as a bundle (e.g. zip / tar)
    const download_info = await datasetFileService.getBundleDownloadInfo({
      dataset_id: req.params.dataset_id,
      actor_id: req.user.id,
    });
    res.json(download_info);
  }),
);

// get download info for a specific file from the dataset
router.get(
  '/:file_id/download_info',
  validate([
    param('file_id').isInt().toInt(),
  ]),
  authorize('dataset', 'download', byDatasetId),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = Get download info for a specific file from the dataset
    const download_info = await datasetFileService.getFileDownloadInfo({
      dataset_id: req.params.dataset_id,
      file_id: req.params.file_id,
      actor_id: req.user.id,
    });
    res.json(download_info);
  }),
);

module.exports = router;
