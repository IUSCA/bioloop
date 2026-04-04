const express = require('express');
const {
  param,
  query,
  body,
  // checkSchema,
} = require('express-validator');
const createError = require('http-errors');
const config = require('config');
const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize, toCapabilitiesArray } = require('@/authorization');
const datasetService = require('@/services/datasets_v2');
const { isPlatformAdmin } = require('@/services/auth');
const { RESOURCE_SCOPES } = require('@/services/resources');

const router = express.Router();

// ── List & search ────────────────────────────────────────────────────────────

// Open to any authenticated user; service-layer ownership filtering is applied separately
router.get(
  '/',
  validate([
    query('is_deleted').toBoolean().default(false),
    query('is_archived').optional().toBoolean(),
    query('is_staged').optional().toBoolean(),
    query('has_workflows').optional().toBoolean(),
    query('has_derived_data').optional().toBoolean(),
    query('has_source_data').optional().toBoolean(),
    query('type').optional().isIn(config.dataset_types),
    query('name').optional().notEmpty(),
    query('owner_group_id').optional().isUUID(),
    query('collection_id').optional().isUUID(),
    query('days_since_last_staged').optional().isInt().toInt(),
    query('created_at_start').optional().isISO8601(),
    query('created_at_end').optional().isISO8601(),
    query('updated_at_start').optional().isISO8601(),
    query('updated_at_end').optional().isISO8601(),
    query('limit').default(100).isInt({ min: 0, max: 1000 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('sort_by').default('updated_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('match_name_exact').default(false).toBoolean(),
    query('include_states').optional().toBoolean(),
    query('include_bundle').optional().toBoolean(),
    query('id').optional().isInt().toInt(),
    query('resource_id').optional().isUUID(),
    query('scope').default(RESOURCE_SCOPES.ALL).isIn(Object.values(RESOURCE_SCOPES)),
  ]),
  authorize('dataset', 'list'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'List and search datasets'

    const filters = _.pick(
      ['is_deleted', 'is_archived', 'is_staged',
        'has_workflows', 'has_derived_data', 'has_source_data',
        'type', 'name', 'id', 'resource_id', 'owner_group_id', 'collection_id', 'scope',
        'created_at_start', 'created_at_end', 'updated_at_start', 'updated_at_end', 'days_since_last_staged'],
    )(req.query);

    const sort = _.pick(['sort_by', 'sort_order'])(req.query);

    const pagination = _.pick(['limit', 'offset'])(req.query);

    const includes = {
      states: req.query.include_states,
      bundle: req.query.include_bundle,
    };

    // if user is platform admin, search all groups, otherwise search only groups the user has access to
    let promise;
    if (isPlatformAdmin(req)) {
      promise = datasetService.searchAllDatasets({
        filters, sort, pagination, includes,
      });
    } else {
      promise = datasetService.searchDatasetsForUser({
        filters, sort, pagination, includes, user_id: req.user.subject_id,
      });
    }

    const { metadata, data } = await promise;
    const filteredData = data.map((dataset) => req.permission.filter(dataset));
    res.json({ metadata, data: filteredData });
  }),
);

// ── Get by ID ────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('dataset', 'view_metadata', { shouldDeriveCapabilities: true, shouldDeriveCallerRole: true }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get a dataset by ID'
    const dataset = await datasetService.getDatasetById(req.params.id, { includes: {} });
    if (!dataset) {
      return res.status(404).json({ message: 'Dataset not found' });
    }
    res.json({
      ...req.permission.filter(dataset),
      _meta: {
        caller_role: req.permission.callerRole,
        capabilities: toCapabilitiesArray(req.permission.capabilities),
      },
    });
  }),
);

// ── Create ───────────────────────────────────────────────────────────────────

// router.post(
//   '/',
//   ...
// );

// ── Patch (metadata) ─────────────────────────────────────────────────────────

router.patch(
  '/:id',
  validate([
    param('id').isUUID(),
    body('name').optional().isString().notEmpty(),
    body('description').optional().isString(),
  ]),
  authorize('dataset', 'edit_metadata'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Update dataset metadata (name, description)'

    // Fetch dataset to get integer id and verify it exists
    const dataset = await datasetService.getDatasetById(req.params.id, { includes: {} });
    if (!dataset) {
      return next(createError(404, 'Dataset not found'));
    }

    // Perform update with integer id
    const updated = await datasetService.patchDataset(dataset.id, req.body);
    res.json(req.permission.filter(updated));
  }),
);

// ── Archive ──────────────────────────────────────────────────────────────────

router.post(
  '/:id/archive',
  validate([
    param('id').isUUID(),
  ]),
  authorize('dataset', 'archive'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Archive (soft-delete) a dataset'

    const dataset = await datasetService.getDatasetById(req.params.id, { includes: {} });
    if (!dataset) {
      return next(createError(404, 'Dataset not found'));
    }

    await datasetService.softDelete(dataset.id, req.user.id);
    res.sendStatus(204);
  }),
);

// ── Create ───────────────────────────────────────────────────────────────────

// // ── Patch ────────────────────────────────────────────────────────────────────

// router.patch(
//   '/:id',
//   validate([
//     param('id').isInt().toInt(),
//     body('du_size').optional().notEmpty().bail()
//       .customSanitizer(BigInt),
//     body('size').optional().notEmpty().bail()
//       .customSanitizer(BigInt),
//     body('bundle_size').optional().notEmpty().bail()
//       .customSanitizer(BigInt),
//     body('bundle').optional().isObject(),
//   ]),
//   authorize('dataset', 'edit_metadata'),
//   asyncHandler(async (req, res) => {
//     // #swagger.tags = ['datasets']
//     // #swagger.summary = 'Partially update a dataset'
//     const dataset = await datasetService.patchDataset(req.params.id, req.body);
//     res.json(dataset);
//   }),
// );

// // ── States ───────────────────────────────────────────────────────────────────

// router.post(
//   '/:id/states',
//   validate([
//     param('id').isInt().toInt(),
//     body('state').notEmpty(),
//   ]),
//   authorize('dataset', 'edit'),
//   asyncHandler(async (req, res) => {
//     // #swagger.tags = ['datasets']
//     // #swagger.summary = 'Append a state to a dataset'
//     await datasetService.addState(req.params.id, req.body.state, req.body.metadata);
//     res.sendStatus(204);
//   }),
// );

// // ── Delete (soft) ────────────────────────────────────────────────────────────

// router.delete(
//   '/:id',
//   validate([
//     param('id').isInt().toInt(),
//   ]),
//   authorize('dataset', 'archive'),
//   asyncHandler(async (req, res) => {
//     // #swagger.tags = ['datasets']
//     // #swagger.summary = 'Soft-delete a dataset'
//     await datasetService.softDelete(req.params.id, req.user.id);
//     res.sendStatus(204);
//   }),
// );

// // ── Sub-routers ──────────────────────────────────────────────────────────────

router.use(
  '/:dataset_id/files',
  require('./files'),
);

router.use(
  '/:dataset_id/workflows',
  require('./workflows'),
);

module.exports = router;
