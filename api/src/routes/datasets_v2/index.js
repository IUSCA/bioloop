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
const {
  createAuthorizationMiddleware: authorize, toCapabilitiesArray, authorizeAction,
} = require('@/authorization');
const datasetService = require('@/services/datasets_v2');
const { isPlatformAdmin } = require('@/services/auth');
const { RESOURCE_SCOPES } = require('@/services/resources');

const router = express.Router();

// ── Creation support ─────────────────────────────────────────────────────────

/**
 * Groups this caller may give a new dataset to.
 *
 * Open to any authenticated user; the answer is scoped to them. Each row carries
 * `admitted_by`, so the creation dialog can say why a group is offered rather than showing
 * an unexplained list. The creation routes still authorize — this is a convenience.
 *
 * @see docs/design/groups/dataset-creation-plan.md — A2
 */
router.get(
  '/eligible-owner-groups',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Groups the caller may create a dataset in'
    const groups = await datasetService.listEligibleOwnerGroups(req.user);
    res.json(groups);
  }),
);

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
    const dataset = await datasetService.getDatasetById(req.params.id, {
      includes: {
        owner_group: true,
      },
    });
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

/**
 * Creates a dataset under an owning group.
 *
 * `owner_group_id` is required here even though the column is nullable, because the legacy
 * creation routes still write rows without one until cut-over.
 * @see docs/design/v2-cutover.md — What v2 requires that the schema does not
 */
router.post(
  '/',
  validate([
    body('name').isString().notEmpty(),
    body('type').isIn(config.get('dataset_types')),
    body('owner_group_id').isUUID(),
    body('origin_path').isString().trim().notEmpty(),
    body('description').optional().isString(),
    body('metadata').optional().isObject(),
    body('du_size').optional().notEmpty().customSanitizer(BigInt),
    body('size').optional().notEmpty().customSanitizer(BigInt),
    body('bundle_size').optional().notEmpty().customSanitizer(BigInt),
    body('src_instrument_id').optional().isInt().toInt(),
    body('src_dataset_id').optional().isInt().toInt(),
    body('workflow_id').optional().isString(),
    body('state').optional().isString(),
    body('create_method').optional().isString(),
    // Conditions the donors consented to, captured and never enforced.
    // @see docs/design/groups/decisions.md — 9. Consent codes are captured, not enforced
    body('use_conditions').optional().isArray(),
    body('use_conditions.*.system').notEmpty().isString(),
    body('use_conditions.*.code').notEmpty().isString(),
    body('use_conditions.*.label').optional().isString(),
    body('use_conditions.*.note').optional().isString(),
  ]),
  authorize('dataset', 'create', {
    resourceIdFn: () => null,
    preFetchedResourceFn: (req) => ({ owner_group_id: req.body.owner_group_id }),
  }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Create a dataset owned by a group'

    const createQuery = datasetService.buildDatasetCreateQuery({
      ..._.pick([
        'name', 'type', 'owner_group_id', 'origin_path', 'description', 'metadata',
        'du_size', 'size', 'bundle_size', 'src_instrument_id', 'src_dataset_id',
        'workflow_id', 'state', 'create_method', 'use_conditions',
      ])(req.body),
      user_id: req.user.id,
      recorded_by: req.user.subject_id,
    });

    // Idempotent: a live dataset with the same name and type is a conflict, not a duplicate.
    const dataset = await datasetService.createDataset({
      data: createQuery,
      actor_id: req.user.subject_id,
    });

    if (!dataset) {
      return next(createError.Conflict('A dataset with this name and type already exists'));
    }
    res.status(201).json(dataset);
  }),
);

// ── Bulk create ──────────────────────────────────────────────────────────────

/**
 * Creates many datasets, each under its own owning group. Used by the watch script.
 *
 * A dataset body here is the same shape as the single-create body above, `owner_group_id`
 * included, so a caller never reshapes its payloads to send them in bulk. The caller must
 * be permitted to create under every group the batch names; the check runs once per
 * distinct group rather than once per dataset.
 * @see docs/design/groups/dataset-creation.md — The watch script
 *
 * Responds with { created, conflicted, errored }. A name and type already held by a live
 * dataset is a conflict rather than an error, because a scan sees the same directory on
 * every pass.
 */
router.post(
  '/bulk',
  validate([
    body('datasets').isArray({ min: 1, max: 100 }),
    body('datasets.*.name').notEmpty(),
    body('datasets.*.type').isIn(config.get('dataset_types')),
    body('datasets.*.owner_group_id').isUUID(),
    body('datasets.*.origin_path').isString().trim().notEmpty(),
    body('datasets.*.description').optional().isString(),
    body('datasets.*.metadata').optional().isObject(),
    body('datasets.*.du_size').optional().notEmpty().customSanitizer(BigInt),
    body('datasets.*.size').optional().notEmpty().customSanitizer(BigInt),
    body('datasets.*.bundle_size').optional().notEmpty().customSanitizer(BigInt),
    body('datasets.*.src_instrument_id').optional().isInt().toInt(),
    body('datasets.*.src_dataset_id').optional().isInt().toInt(),
    body('datasets.*.workflow_id').optional().isString(),
    body('datasets.*.state').optional().isString(),
    body('datasets.*.create_method').optional().isString(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Create many datasets, each owned by a group'

    // Authorized here rather than by the authorize() middleware, which evaluates one
    // resource per request. The policy context is shared across the calls, so the caller
    // is hydrated once however many groups the batch names.
    const ownerGroupIds = [...new Set(req.body.datasets.map((d) => d.owner_group_id))];
    for (const owner_group_id of ownerGroupIds) {
      // eslint-disable-next-line no-await-in-loop
      const decision = await authorizeAction('dataset', 'create', {
        identifiers: { user: req.user?.subject_id, resource: null },
        policyExecutionContext: req.policyContext,
        preFetched: { user: req.user, resource: { owner_group_id }, context: { req } },
      });
      if (!decision.granted) {
        return next(createError.Forbidden(
          `Not permitted to create datasets owned by group ${owner_group_id}`,
        ));
      }
    }

    const datasets = req.body.datasets.map(_.pick([
      'name', 'type', 'owner_group_id', 'origin_path', 'description', 'metadata',
      'du_size', 'size', 'bundle_size', 'src_instrument_id', 'src_dataset_id',
      'workflow_id', 'state', 'create_method',
    ]));

    const result = await datasetService.bulkCreateDatasets(
      datasets,
      req.user.id,
      req.user.subject_id,
    );
    return res.json(result);
  }),
);

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

// ── Source Datasets ──────────────────────────────────────────────────────────

router.get(
  '/:id/source-datasets',
  validate([
    param('id').isUUID(),
    query('limit').default(50).isInt({ min: 0, max: 500 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  authorize('dataset', 'view_source_datasets'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get source datasets that this dataset was derived from'

    const dataset = await datasetService.getDatasetById(req.params.id, { includes: {} });
    if (!dataset) {
      return next(createError(404, 'Dataset not found'));
    }

    const { limit, offset } = _.pick(['limit', 'offset'])(req.query);
    const { data, metadata } = await datasetService.getSourceDatasets(dataset.id, { limit, offset });

    // Filter each source dataset through permission filters
    const filteredData = data.map((sourceDataset) => req.permission.filter(sourceDataset));

    res.json({ metadata, data: filteredData });
  }),
);

// ── Derived Datasets ─────────────────────────────────────────────────────────

router.get(
  '/:id/derived-datasets',
  validate([
    param('id').isUUID(),
    query('limit').default(50).isInt({ min: 0, max: 500 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  authorize('dataset', 'view_derived_datasets'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['datasets']
    // #swagger.summary = 'Get datasets derived from this dataset'

    const dataset = await datasetService.getDatasetById(req.params.id, { includes: {} });
    if (!dataset) {
      return next(createError(404, 'Dataset not found'));
    }

    const { limit, offset } = _.pick(['limit', 'offset'])(req.query);
    const { data, metadata } = await datasetService.getDerivedDatasets(dataset.id, { limit, offset });

    // Filter each derived dataset through permission filters
    const filteredData = data.map((derivedDataset) => req.permission.filter(derivedDataset));

    res.json({ metadata, data: filteredData });
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
  // validate([
  //   param('dataset_id').isUUID(),
  // ]),
  require('./files'),
);

router.use(
  '/:dataset_id/workflows',
  require('./workflows'),
);

module.exports = router;
