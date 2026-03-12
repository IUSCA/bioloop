const express = require('express');
const { param, body, query } = require('express-validator');
const createError = require('http-errors');
const _ = require('lodash/fp');
// const { Prisma } = require('@prisma/client');
// const assert = require('assert');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const collectionService = require('@/services/collections');
// const prisma = require('@/db');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const { pickNonNil } = require('@/utils');

const router = express.Router();

// find collections by owning group ?owning_group_id=xxx
// find collections that a dataset belongs to ?dataset_id=xxx

// find all collections that I have access to
// search collections by name/description
router.post(
  '/search',
  validate([
    body('search_term').isString().optional(),
    body('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
    body('offset').default(0).isInt({ min: 0 }).toInt(),
    body('sort_by').default('name').isIn(['name', 'created_at', 'updated_at', 'size']),
    body('sort_order').default('asc').isIn(['asc', 'desc']),
    body('is_archived').optional().isBoolean(),
    body('owner_group_id').optional().isUUID(),
    body('dataset_id').optional().isUUID(),
  ]),
  authorize('collection', 'list'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Search collections by name or description'

    const params = _.pick([
      'search_term', 'limit', 'offset', 'sort_by', 'sort_order', 'is_archived', 'owner_group_id', 'dataset_id',
    ])(req.body);

    // if user is platform admin, search all groups, otherwise search only groups the user has access to
    const isPlatformAdmin = req.user?.roles?.includes('admin') === true;

    let promise;
    if (isPlatformAdmin) {
      promise = collectionService.searchAllCollections(params);
    } else {
      promise = collectionService.searchCollectionsForUser({ ...params, user_id: req.user.subject_id });
    }

    const { metadata, data } = await promise;
    const filteredData = data.map((collection) => req.permission.filter(collection));
    res.json({ metadata, data: filteredData });
  }),
);

// get collection by id
router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('collection', 'view_metadata'),
  asyncHandler(async (req, res) => {
    const collection = await collectionService.getCollectionById(req.params.id, req.user.subject_id);
    res.json(req.permission.filter(collection));
  }),
);

// create collection
router.post(
  '/',
  authorize('collection', 'create', {
    resourceIdFn: () => null,
    preFetchedResourceFn: (req) => ({ owner_group_id: req.body.owner_group_id }),
  }),
  validate([
    body('name').isString().notEmpty(),
    body('description').optional().isString(),
    body('owner_group_id').isUUID(),
    body('metadata').optional().isObject(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Create a new collection'

    const data = pickNonNil(['name', 'description', 'owner_group_id', 'metadata'])(req.body);
    const newCollection = await collectionService.createCollection(data, { actor_id: req.user.subject_id });
    res.status(201).json(req.permission.filter(newCollection));
  }),
);

// update collection metadata (name, description, custom metadata)
router.patch(
  '/:id',
  validate([
    param('id').isUUID(),
    body('name').optional().isString().notEmpty(),
    body('description').optional().isString(),
    body('metadata').optional().isObject(),
    body('version').isInt(), // for optimistic locking
  ]),
  authorize('collection', 'edit_metadata'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Update collection metadata (name, description, custom metadata)'

    const data = pickNonNil(['name', 'description', 'metadata'])(req.body);
    if (_.isEmpty(data)) {
      return next(createError(400, 'At least one metadata field must be provided for update'));
    }
    const updatedCollection = await collectionService.updateCollectionMetadata(
      req.params.id,
      {
        data,
        actor_id: req.user.subject_id,
        expected_version: req.body.version,
      },
    );
    res.json(req.permission.filter(updatedCollection));
  }),
);

// delete collection
router.delete(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('collection', 'delete'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Delete a collection'

    await collectionService.deleteCollection(req.params.id, req.user.subject_id);
    res.status(204).send();
  }),
);

// list datasets in collection
router.get(
  '/:id/datasets',
  validate([
    param('id').isUUID(),
    query('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('sort_by').default('name').isIn(['name', 'created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
  ]),
  authorize('collection', 'list_datasets'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'List datasets in a collection'

    const { metadata, data } = await collectionService.listDatasetsInCollection({
      collection_id: req.params.id,
      limit: req.query.limit,
      offset: req.query.offset,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    });
    const filteredDatasets = data.map((d) => req.permission.filter(d));
    res.json({ metadata, data: filteredDatasets });
  }),
);

// Add dataset(s) to collection
router.post(
  '/:id/datasets',
  validate([
    param('id').isUUID(),
    body('dataset_ids').isArray({ min: 1 }),
    body('dataset_ids.*').isUUID(),
  ]),
  authorize('collection', 'add_dataset'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Add one or more datasets to a collection'

    const { dataset_ids } = req.body;
    await collectionService.addDatasets(
      req.params.id,
      {
        dataset_ids,
        actor_id: req.user.subject_id,
      },
    );
    res.status(204).send();
  }),
);

// remove dataset from collection
router.delete(
  '/:id/datasets/:datasetId',
  validate([
    param('id').isUUID(),
    param('datasetId').isUUID(),
  ]),
  authorize('collection', 'remove_dataset'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Remove a dataset from a collection'

    const { id, datasetId } = req.params;
    await collectionService.removeDatasets(id, { dataset_ids: [datasetId], actor_id: req.user.subject_id });
    res.status(204).send();
  }),
);

// bulk remove datasets from collection
router.delete(
  '/:id/datasets',
  validate([
    param('id').isUUID(),
    body('dataset_ids').isArray({ min: 1 }),
    body('dataset_ids.*').isUUID(),
  ]),
  authorize('collection', 'remove_dataset'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Bulk remove datasets from a collection'

    const { dataset_ids } = req.body;
    await collectionService.removeDatasets(req.params.id, { dataset_ids, actor_id: req.user.subject_id });
    res.status(204).send();
  }),
);

// archive collection
router.post(
  '/:id/archive',
  validate([
    param('id').isUUID(),
  ]),
  authorize('collection', 'archive'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Archive a collection'

    await collectionService.archiveCollection(req.params.id, req.user.subject_id);
    res.status(204).send();
  }),
);

// unarchive collection
router.post(
  '/:id/unarchive',
  validate([
    param('id').isUUID(),
  ]),
  authorize('collection', 'unarchive'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Unarchive a collection'

    await collectionService.unarchiveCollection(req.params.id, req.user.subject_id);
    res.status(204).send();
  }),
);

// POST /api/collections/:id/transfer-ownership
// router.post('/:id/transfer-ownership', asyncHandler(async (req, res) => {}));

module.exports = router;
