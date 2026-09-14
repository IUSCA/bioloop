const express = require('express');
const { param, body, query } = require('express-validator');
const createError = require('http-errors');
const _ = require('lodash/fp');
// const { Prisma } = require('@prisma/client');
// const assert = require('assert');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const collectionService = require('@/services/collections');
const profileService = require('@/services/profiles');
const datasetService = require('@/services/datasets_v2');
const workflowService = require('@/services/datasets_v2/workflows');
const prisma = require('@/db');
const auditService = require('@/services/audit');
const {
  createAuthorizationMiddleware: authorize, toCapabilitiesArray, authorizeAction,
} = require('@/authorization');
const { pickNonNil, setsEqual } = require('@/utils');
const { isPlatformAdmin } = require('@/services/auth');
const { RESOURCE_SCOPES } = require('@/services/resources');
const { dataset: DATASET_PUBLIC_ATTRIBUTES } = require('@/authorization/builtin/policies/base_attributes');

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
    body('sort_by').default('name').isIn(['name', 'created_at', 'updated_at', '_count.datasets']),
    body('sort_order').default('asc').isIn(['asc', 'desc']),
    body('is_archived').optional().isBoolean(),
    body('owner_group_id').optional().isUUID(),
    body('dataset_id').optional().isUUID(),
    body('scope').default(RESOURCE_SCOPES.ALL).isIn(Object.values(RESOURCE_SCOPES)), // owned = collections owned by groups I belong to, accessible = collections I have any access to
  ]),
  authorize('collection', 'list'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Search collections by name or description'

    const params = _.pick([
      'search_term', 'limit', 'offset', 'sort_by', 'sort_order', 'is_archived', 'owner_group_id', 'dataset_id',
    ])(req.body);

    // if user is platform admin, search all groups, otherwise search only groups the user has access to

    let promise;
    if (isPlatformAdmin(req)) {
      promise = collectionService.searchAllCollections(params);
    } else {
      promise = collectionService.searchCollectionsForUser({
        ...params,
        scope: req.body.scope,
        user_id: req.user.subject_id,
      });
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
  authorize('collection', 'view_metadata', { shouldDeriveCapabilities: true, shouldDeriveCallerRole: true }),
  asyncHandler(async (req, res) => {
    const collection = await collectionService.getCollectionById(req.params.id, req.user.subject_id);
    // res.json(req.permission.filter(collection));
    res.json({
      ...req.permission.filter(collection),
      // Derived from the owning group's name, the year, and the public URL, so it carries
      // nothing the caller could not already see.
      // @see docs/design/groups/profiles.md — Schema
      citation: profileService.resolveCitation(collection, 'collections'),
      _meta: {
        caller_role: req.permission.callerRole,
        capabilities: toCapabilitiesArray(req.permission.capabilities),
      },
    });
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
    body('dataset_ids').optional().isArray({ min: 1 }),
    body('dataset_ids.*').isUUID(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Create a new collection'

    const data = pickNonNil(['name', 'description', 'owner_group_id', 'metadata', 'dataset_ids'])(req.body);

    // validate that if dataset_ids are provided, they all belong to the same owner group as the collection and are not archived
    if (data.dataset_ids) {
      const validDatasets = await prisma.dataset.findMany({
        where: {
          resource_id: { in: data.dataset_ids },
          owner_group_id: data.owner_group_id,
          is_deleted: false,
        },
        select: { resource_id: true },
      });
      if (!setsEqual(new Set(validDatasets.map((d) => d.resource_id)), new Set(data.dataset_ids))) {
        return next(createError(
          400,
          'All datasets must exist, not be archived, and belong to the specified owner group',
        ));
      }
      // deduplicate dataset IDs
      data.dataset_ids = [...new Set(data.dataset_ids)];
    }

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

// Update the collection profile.
// @see docs/design/groups/profiles.md — API
router.patch(
  '/:id/profile',
  validate([
    param('id').isUUID(),
    body('version').isInt({ min: 1 }).toInt(),
    body('tagline').optional({ nullable: true }),
    body('about_md').optional({ nullable: true }),
    body('profile_visibility').optional().isString(),
    body('links').optional({ nullable: true }).isArray(),
    body('citation').optional({ nullable: true }),
    body('publications').optional({ nullable: true }).isArray(),
  ]),
  authorize('collection', 'edit_metadata'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Update the collection profile'
    const updated = await profileService.updateCollectionProfile(req.params.id, {
      data: req.body,
      actor_id: req.user.subject_id,
      expected_version: req.body.version,
    });
    res.json(req.permission.filter(updated));
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

/**
 * Whether the caller may stage one dataset.
 *
 * The collection datasets list and the stage route both ask this, so the staging a row offers
 * and the answer the stage route gives cannot disagree. The policy context is shared across
 * calls in one request, so the caller is hydrated once however many datasets are checked.
 * @param {import('express').Request} req
 * @param {string} resource_id
 * @returns {Promise<boolean>}
 */
async function canRequestStage(req, resource_id) {
  const decision = await authorizeAction('dataset', 'request_stage', {
    identifiers: { user: req.user?.subject_id, resource: resource_id },
    policyExecutionContext: req.policyContext,
    preFetched: { user: req.user, context: { req } },
  });
  return decision.granted;
}

/**
 * Every dataset in the collection, for a caller permitted to browse it.
 *
 * Browsing a collection does not mean every dataset in it opens: a bare
 * COLLECTION:LIST_CONTENTS grant confers the first and not the second. Each row carries
 * `_meta.can_view_metadata`, so the page shows a row that will not open as plain text and offers a
 * request on the collection rather than a link onto a refusal. Each row also carries
 * `_meta.can_request_stage`, from the check the stage route makes, so the page offers staging
 * only where that route would accept it.
 *
 * Rows carry the dataset's public attributes whoever the caller is, the rule `dataset.list`
 * applies.
 * @see docs/design/groups/ui-information-architecture.md — Tab visibility on a collection detail page
 */
router.get(
  '/:id/datasets',
  validate([
    param('id').isUUID(),
    query('name').optional().isString().trim()
      .notEmpty(),
    query('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('sort_by').default('name').isIn(['name', 'size', 'created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
  ]),
  authorize('collection', 'list_datasets'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'List datasets in a collection'

    const { metadata, data } = await collectionService.listDatasetsInCollection({
      collection_id: req.params.id,
      name: req.query.name,
      limit: req.query.limit,
      offset: req.query.offset,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    });

    const resourceIds = data.map((d) => d.resource_id);
    const viewable = isPlatformAdmin(req)
      ? new Set(resourceIds)
      : await datasetService.viewableDatasetIds(req.user.subject_id, resourceIds);

    // One at a time, as bulkStage does, so the first call fills the shared policy context.
    const stageable = new Set();
    for (const d of data) {
      // eslint-disable-next-line no-await-in-loop
      if (await canRequestStage(req, d.resource_id)) stageable.add(d.resource_id);
    }

    res.json({
      metadata,
      data: data.map((d) => ({
        ..._.pick(DATASET_PUBLIC_ATTRIBUTES)(d),
        _meta: {
          can_view_metadata: viewable.has(d.resource_id),
          can_request_stage: stageable.has(d.resource_id),
        },
      })),
    });
  }),
);

/**
 * Audit records for one collection.
 *
 * Scoped to this collection and authorized by `collection.view_audit_logs`, so the owning group's
 * admins and oversight authorities can read it. The platform-wide `GET /audit/records` stays
 * platform-admin only; it answers a different question and cannot be scoped by the caller's
 * authority.
 *
 * @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
 */
router.get(
  '/:id/audit',
  validate([
    param('id').isUUID(),
    query('event_type').optional().isString().trim(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('limit').default(50).isInt({ min: 1, max: 500 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  authorize('collection', 'view_audit_logs'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Audit records for a collection'

    const {
      event_type, start_date, end_date, sort_order, limit, offset,
    } = req.query;

    const result = await auditService.getResourceAuditRecords({
      resource_id: req.params.id,
      event_type,
      start_date,
      end_date,
      sort_order,
      limit,
      offset,
    });

    res.json(result);
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

/**
 * Stages several of a collection's datasets at once.
 *
 * Naming no dataset stages the whole collection. Authorization is per dataset, because a
 * collection groups datasets that different groups own and different people can reach, so a
 * caller is told what was staged, what was refused, and what needed nothing — rather than
 * having the batch refused because one dataset was out of reach.
 *
 * @see .todo/issues/06-dataset-actions-workflows.md — Phase 5
 */
router.post(
  '/:id/stage',
  validate([
    param('id').isUUID(),
    body('dataset_ids').optional().isArray({ min: 1, max: workflowService.MAX_BULK_STAGE }),
    body('dataset_ids.*').isUUID(),
  ]),
  authorize('collection', 'view_metadata'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Collections']
    // #swagger.summary = 'Stage datasets in a collection'

    const { data: members } = await datasetService.getDatasetsByCollection(req.params.id, {
      filters: { is_deleted: false },
      pagination: { limit: workflowService.MAX_BULK_STAGE + 1 },
      sort: { sort_by: 'name', sort_order: 'asc' },
      includes: {},
    });

    const requested = req.body.dataset_ids;
    const datasets = requested
      ? members.filter((d) => requested.includes(d.resource_id))
      : members;

    if (datasets.length > workflowService.MAX_BULK_STAGE) {
      return next(createError(
        400,
        `Stage at most ${workflowService.MAX_BULK_STAGE} datasets at a time; select a subset`,
      ));
    }
    if (datasets.length === 0) {
      return next(createError(404, 'No datasets in this collection matched the request'));
    }

    const result = await workflowService.bulkStage(datasets, {
      permits: (resource_id) => canRequestStage(req, resource_id),
      initiator_id: req.user.id,
    });
    return res.json(result);
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
