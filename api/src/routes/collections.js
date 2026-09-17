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
const accessRequestsService = require('@/services/access_requests');
const {
  createAuthorizationMiddleware: authorize, authorizeAction,
  callerIsPlatformAdmin, decideRows,
} = require('@/authorization');
const { pickNonNil, setsEqual } = require('@/utils');
const { RESOURCE_SCOPES } = require('@/services/resources');
const { dataset: DATASET_PUBLIC_ATTRIBUTES } = require('@/authorization/builtin/policies/base_attributes');
const { buildMeta } = require('@/services/meta');

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
    if (await callerIsPlatformAdmin(req)) {
      promise = collectionService.searchAllCollections(params);
    } else {
      promise = collectionService.searchCollectionsForUser({
        ...params,
        scope: req.body.scope,
        user_id: req.user.subject_id,
      });
    }

    const { metadata, data } = await promise;
    // The query scopes the rows, and the list decision's filter picks every row's fields.
    res.json({ metadata, data: data.map((collection) => req.permission.filter(collection)) });
  }),
);

// get collection by id
router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('collection', 'view_metadata', { shouldDeriveCapabilities: true, shouldDeriveStanding: true }),
  asyncHandler(async (req, res) => {
    const collection = await collectionService.getCollectionById(req.params.id, req.user.subject_id);
    // res.json(req.permission.filter(collection));
    res.json({
      ...req.permission.filter(collection),
      // Derived from the owning group's name, the year, and the public URL, so it carries
      // nothing the caller could not already see.
      // @see docs/design/groups/implementation/profiles.md — Schema
      citation: profileService.resolveCitation(collection, 'collections'),
      _meta: buildMeta('collection', collection, req.permission, {
        extraCapabilities: await accessRequestsService.mayFileRequest({ user: req.user, resource_id: req.params.id })
          ? ['request_access'] : [],
      }),
    });
  }),
);

// create collection
router.post(
  '/',
  // Validated first: the restriction check resolves a create to the owning group the body
  // names, so a body without one must be refused as malformed before authorization asks.
  validate([
    body('name').isString().notEmpty(),
    body('description').optional().isString(),
    body('owner_group_id').isUUID(),
    body('metadata').optional().isObject(),
    body('dataset_ids').optional().isArray({ min: 1 }),
    body('dataset_ids.*').isUUID(),
  ]),
  authorize('collection', 'create', {
    resourceIdFn: () => null,
    preFetchedResourceFn: (req) => ({ owner_group_id: req.body.owner_group_id }),
  }),
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
// @see docs/design/groups/implementation/profiles.md — API
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

/**
 * Whether the caller may stage one dataset.
 *
 * The bulk stage route asks this for each dataset. The policy context is shared across calls in
 * one request, so the caller is hydrated once however many datasets are checked.
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
 * `_meta.capabilities` and `_meta.standing` from `decideRows`. A row without `view_metadata`
 * shows as plain text, and the page offers a request on the collection rather than a link onto
 * a refusal. A row offers staging only with `request_stage`, the action the stage route checks.
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

    const metas = await decideRows('dataset', data, { req, idOf: (d) => d.resource_id });
    res.json({
      metadata,
      data: data.map((d, i) => ({ ..._.pick(DATASET_PUBLIC_ATTRIBUTES)(d), _meta: metas[i] })),
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

    // The owning group comes along because each row's state is checked before it is staged,
    // and the rule reads that group's archived column. One query for the page, not one per row.
    const { data: members } = await datasetService.getDatasetsByCollection(req.params.id, {
      filters: { is_deleted: false },
      pagination: { limit: workflowService.MAX_BULK_STAGE + 1 },
      sort: { sort_by: 'name', sort_order: 'asc' },
      includes: { owner_group: true },
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
