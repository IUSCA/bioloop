const express = require('express');
const {
  param, query, body, checkSchema,
} = require('express-validator');
const createError = require('http-errors');
const config = require('config');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const datasetService = require('@/services/datasets_v2');
const collectionService = require('@/services/collections');

const router = express.Router();

// ── Stats & utility ──────────────────────────────────────────────────────────

// Summary statistics — open to any authenticated user
router.get(
  '/stats',
  validate([
    query('type').isIn(config.dataset_types).optional(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get summary statistics of datasets'
    const stats = await datasetService.getStats(req.query.type);
    res.json(stats);
  }),
);

// Name-existence check — open to any authenticated user
router.get(
  '/:datasetType/:name/exists',
  validate([
    param('datasetType').trim().notEmpty(),
    param('name').trim().notEmpty(),
    query('deleted').toBoolean().default(false),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Determine if a dataset with a given name already exists'
    const exists = await datasetService.checkNameExists(
      req.params.datasetType,
      req.params.name,
      req.query.deleted,
    );
    res.json({ exists });
  }),
);

// ── Dataset hierarchy associations ──────────────────────────────────────────

// Authorized against the first source dataset as a representative check
router.post(
  '/associations',
  validate([
    body().isArray({ min: 1 }),
    checkSchema({
      '*.source_id': {
        in: ['body'],
        isInt: { errorMessage: 'source_id must be an integer' },
        toInt: true,
      },
      '*.derived_id': {
        in: ['body'],
        isInt: { errorMessage: 'derived_id must be an integer' },
        toInt: true,
      },
    }),
  ]),
  authorize('dataset', 'edit_metadata', { resourceIdFn: (req) => req.body[0]?.source_id }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Add parent–child associations between datasets'
    await datasetService.createAssociations(req.body);
    res.sendStatus(200);
  }),
);

// ── List & search ────────────────────────────────────────────────────────────

// Open to any authenticated user; service-layer ownership filtering is applied separately
router.get(
  '/',
  validate([
    query('deleted').toBoolean().default(false),
    query('has_workflows').toBoolean().optional(),
    query('has_derived_data').toBoolean().optional(),
    query('has_source_data').toBoolean().optional(),
    query('archived').toBoolean().optional(),
    query('staged').toBoolean().optional(),
    query('type').isIn(config.dataset_types).optional(),
    query('name').notEmpty().optional(),
    query('days_since_last_staged').isInt().toInt().optional(),
    query('bundle').optional().toBoolean(),
    query('created_at_start').isISO8601().optional(),
    query('created_at_end').isISO8601().optional(),
    query('updated_at_start').isISO8601().optional(),
    query('updated_at_end').isISO8601().optional(),
    query('limit').isInt({ min: 1 }).toInt().optional(),
    query('offset').isInt({ min: 0 }).toInt().optional(),
    query('sort_by').default('updated_at'),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('match_name_exact').default(false).toBoolean(),
    query('include_states').toBoolean().optional(),
    query('include_audit_logs').toBoolean().optional(),
    query('include_projects').toBoolean().optional(),
    query('id').isInt().toInt().optional(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'List and search datasets'
    const result = await datasetService.getDatasets(req.query);
    res.json(result);
  }),
);

// ── Get by id ────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  validate([
    param('id').isInt().toInt(),
    query('files').toBoolean().default(false),
    query('workflows').toBoolean().default(false),
    query('last_task_run').toBoolean().default(false),
    query('prev_task_runs').toBoolean().default(false),
    query('only_active').toBoolean().default(false),
    query('bundle').optional().toBoolean(),
    query('include_projects').optional().toBoolean(),
    query('initiator').optional().toBoolean(),
    query('include_source_instrument').toBoolean().optional(),
  ]),
  authorize('dataset', 'view_metadata'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get a dataset by ID'
    const dataset = await datasetService.getDataset({
      id: req.params.id,
      files: req.query.files,
      workflows: req.query.workflows,
      last_task_run: req.query.last_task_run,
      prev_task_runs: req.query.prev_task_runs,
      only_active: req.query.only_active,
      bundle: req.query.bundle || false,
      include_projects: req.query.include_projects || false,
      initiator: req.query.initiator || false,
      include_source_instrument: req.query.include_source_instrument || false,
    });
    res.json(dataset);
  }),
);

// ── Create ───────────────────────────────────────────────────────────────────

// TODO: auth: only platform admins
// Single dataset create.
router.post(
  '/',
  validate([
    body('name').notEmpty(),
    body('type').isIn(config.get('dataset_types')),
    body('origin_path').trim().notEmpty(),
    body('owner_group_id').optional().isUUID(),
    body('du_size').optional().notEmpty().customSanitizer(BigInt),
    body('size').optional().notEmpty().customSanitizer(BigInt),
    body('bundle_size').optional().notEmpty().customSanitizer(BigInt),
    body('src_instrument_id').optional(),
    body('src_dataset_id').optional(),
    body('workflow_id').optional(),
    body('create_method').optional(),
    body('state').optional(),
    body('metadata').optional(),
    body('description').optional().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Create a new dataset'

    const createQuery = datasetService.buildDatasetCreateQuery({
      ...req.body,
      user_id: req.user.id,
    });

    const dataset = await datasetService.createDataset({
      data: createQuery,
    });

    if (!dataset) return next(createError.Conflict('A dataset with this name and type already exists'));
    res.json(dataset);
  }),
);

// TODO: auth: only platform admins
// Bulk create datasets
router.post(
  '/bulk',
  validate([
    body('datasets').isArray({ min: 1, max: 100 }),
    body('datasets.*.name').notEmpty(),
    body('datasets.*.type').isIn(config.get('dataset_types')),
    body('datasets.*.origin_path').notEmpty(),
    body('datasets.*.owner_group_id').optional().isUUID(),
    body('datasets.*.du_size').optional().notEmpty().customSanitizer(BigInt),
    body('datasets.*.size').optional().notEmpty().customSanitizer(BigInt),
    body('datasets.*.bundle_size').optional().notEmpty().customSanitizer(BigInt),
    body('datasets.*.src_instrument_id').optional(),
    body('datasets.*.src_dataset_id').optional(),
    body('datasets.*.workflow_id').optional(),
    body('datasets.*.create_method').optional(),
    body('datasets.*.state').optional(),
    body('datasets.*.metadata').optional(),
    body('datasets.*.description').optional().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Bulk create datasets'

    const datasetsWithUser = req.body.datasets.map((d) => ({ ...d, user_id: req.user.id }));
    const result = await datasetService.bulkCreateDatasets(datasetsWithUser, req.user.id);
    res.json(result);
  }),
);

// ── Patch ────────────────────────────────────────────────────────────────────

router.patch(
  '/:id',
  validate([
    param('id').isInt().toInt(),
    body('du_size').optional().notEmpty().bail()
      .customSanitizer(BigInt),
    body('size').optional().notEmpty().bail()
      .customSanitizer(BigInt),
    body('bundle_size').optional().notEmpty().bail()
      .customSanitizer(BigInt),
    body('bundle').optional().isObject(),
  ]),
  authorize('dataset', 'edit_metadata'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Partially update a dataset'
    const dataset = await datasetService.patchDataset(req.params.id, req.body);
    res.json(dataset);
  }),
);

// ── States ───────────────────────────────────────────────────────────────────

router.post(
  '/:id/states',
  validate([
    param('id').isInt().toInt(),
    body('state').notEmpty(),
  ]),
  authorize('dataset', 'edit_metadata'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Append a state to a dataset'
    await datasetService.addState(req.params.id, req.body.state, req.body.metadata);
    res.sendStatus(204);
  }),
);

// ── Delete (soft) ────────────────────────────────────────────────────────────

router.delete(
  '/:id',
  validate([
    param('id').isInt().toInt(),
  ]),
  authorize('dataset', 'archive'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Soft-delete a dataset'
    await datasetService.softDelete(req.params.id, req.user.id);
    res.sendStatus(204);
  }),
);

// -- Collections that a dataset belongs to ────────────────────────────────────

router.get(
  '/:id/collections',
  validate([
    param('id').isInt().toInt(),
    query('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('sort_by').default('name').isIn(['name', 'created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
  ]),
  authorize('dataset', 'view_collections'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'List collections that a dataset belongs to'
    const { id } = req.params;
    const {
      limit, offset, sort_by, sort_order,
    } = req.query;

    const collections = await collectionService.findCollectionsByDataset({
      dataset_id: id,
      limit,
      offset,
      sort_by,
      sort_order,
    });
    res.json(collections);
  }),
);

// ── Sub-routers ──────────────────────────────────────────────────────────────

router.use(
  '/:dataset_id/files',
  validate([param('dataset_id').isInt().toInt()]),
  require('./files'),
);

router.use(
  '/:dataset_id/workflows',
  validate([param('dataset_id').isInt().toInt()]),
  require('./workflows'),
);

module.exports = router;
