const express = require('express');
const createError = require('http-errors');
const { param, query, body } = require('express-validator');
const _ = require('lodash/fp');
const { isInt } = require('validator');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize, callerIsPlatformAdmin } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const grantService = require('@/services/grants');
const state = require('@/state');
const Expiry = require('@/utils/expiry');
const prisma = require('@/db');
const { RESOURCE_TYPE, SUBJECT_TYPE } = require('@prisma/client');

const { projectObject } = require('@/utils/expression');
const baseAttributes = require('@/authorization/builtin/policies/base_attributes');

const router = express.Router();

// ============================================================================
// Shared Validation Constants & Helpers
// ============================================================================

/**
 * Base validation for grant fields common to create and compute-effective-grants
 */
const baseGrantValidation = [
  body('subject_id').isUUID(),
  body('resource_type').isIn(['DATASET', 'COLLECTION']),
  body('resource_id').isUUID(),
];

/**
 * Items array validation for create and compute-effective-grants
 */
const grantItemsValidation = [
  body('items').isArray({ min: 1 }),
  body('items.*.access_type_id').optional().isInt(),
  body('items.*.preset_id').optional().isInt(),
  body('items.*.approved_expiry')
    .custom(Expiry.validate)
    .bail()
    .customSanitizer((val) => Expiry.fromJSON(val)),
  body('items.*').custom((item) => {
    const hasAccessType = item.access_type_id !== undefined && item.access_type_id !== null;
    const hasPreset = item.preset_id !== undefined && item.preset_id !== null;
    if ((hasAccessType && hasPreset) || (!hasAccessType && !hasPreset)) {
      throw new Error('Item must have exactly one of access_type_id or preset_id');
    }
    return true;
  }),
];

/**
 * Handler-level validation for grant creation requests
 * Returns null if valid, or error response object if invalid
 */
async function validateGrantCreationRequest(req) {
  // Validate access_type_id items are unique within the request
  const accessTypeIds = req.body.items
    .filter((item) => item.access_type_id !== undefined)
    .map((item) => item.access_type_id);
  if (new Set(accessTypeIds).size !== accessTypeIds.length) {
    return { status: 400, message: 'Items must have unique access_type_id within the request' };
  }

  // Validate preset_id items are unique within the request
  const presetIds = req.body.items
    .filter((item) => item.preset_id !== undefined)
    .map((item) => item.preset_id);
  if (new Set(presetIds).size !== presetIds.length) {
    return { status: 400, message: 'Items must have unique preset_id within the request' };
  }

  // validate preset_id exists and is active
  if (presetIds.length > 0) {
    const existingPresets = await prisma.grant_preset.findMany({
      where: { id: { in: presetIds }, is_active: true },
      select: { id: true },
    });
    const existingPresetIds = new Set(existingPresets.map((p) => p.id));
    for (const presetId of presetIds) {
      if (!existingPresetIds.has(presetId)) {
        return { status: 400, message: `preset_id ${presetId} does not exist or is not active` };
      }
    }
  }

  // validate approved_expiry is in the future
  for (const item of req.body.items) {
    if (item.approved_expiry.hasExpired()) {
      return { status: 400, message: 'approved_expiry must be in the future' };
    }
  }

  // validate access types and presets are compatible with requested resource type
  try {
    await grantService.assertGrantItemsApplicableToResourceType(prisma, req.body.resource_type, req.body.items);
  } catch (error) {
    return { status: 400, message: error.message };
  }

  return null; // validation passed
}

// List access types by resource type
router.get(
  '/access-types',
  validate([
    query('resource_type').isIn(Object.values(RESOURCE_TYPE)).optional(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List all access types'

    const { resource_type } = req.query;
    const accessTypes = await grantService.listAccessTypes({ resource_type });

    res.json(accessTypes);
  }),
);

// List grant presets
router.get(
  '/presets',
  validate([
    query('resource_type').optional().isIn(Object.values(RESOURCE_TYPE)),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List all grant presets'

    const presets = await grantService.listPresets({ resource_type: req.query.resource_type });
    res.json(presets);
  }),
);

// Create grants
router.post(
  '/',
  validate([
    ...baseGrantValidation,
    body('justification').optional().isString(),
    body(('source_preset_id')).optional().isInt(), // if created via a grant preset, link back to the preset item that led to this grant
    ...grantItemsValidation,
  ]),
  authorize('grant', 'create', {
    resourceIdFn: () => null, // no specific resource to check for create
    preFetchedResourceFn: (req) => ({
      resource_id: req.body.resource_id,
      resource_type: req.body.resource_type,
    }), // we need the resource attributes to evaluate the policy
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Create new grants for a subject on a resource'

    // Validate request
    const validationError = await validateGrantCreationRequest(req);
    if (validationError) {
      return res.status(validationError.status).json({ message: validationError.message });
    }

    // validate source_preset_id if provided is in items
    if (req.body.source_preset_id) {
      const presetIdInItems = req.body.items.some((item) => item.preset_id === req.body.source_preset_id);
      if (!presetIdInItems) {
        return res.status(400).json({ message: 'source_preset_id must match the preset_id of one of the items' });
      }
    }

    const data = pickNonNil([
      'subject_id',
      'resource_id',
      'resource_type',
      'justification', 'source_preset_id'])(req.body);

    data.granted_by = req.user.subject_id;
    await prisma.$transaction(async (tx) => grantService.issueGrants(tx, data, req.body.items));
    res.status(201).end();
  }),
);

// compute effective grants without creating (dry run) - useful for frontend to preview the effect of a grant creation request, including via presets which may have complex rules and multiple resulting grants
router.post(
  '/compute-effective-grants',
  validate([
    ...baseGrantValidation,
    ...grantItemsValidation,
  ]),
  authorize('grant', 'create', {
    resourceIdFn: () => null, // no specific resource to check for create
    preFetchedResourceFn: (req) => ({
      resource_id: req.body.resource_id,
      resource_type: req.body.resource_type,
    }), // we need the resource attributes to evaluate the policy
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Compute effective grants without creating (dry run)'

    // Validate request
    const validationError = await validateGrantCreationRequest(req);
    if (validationError) {
      return res.status(validationError.status).json({ message: validationError.message });
    }

    const { subject_id, resource_id, resource_type } = req.body;
    const rows = await grantService.previewIssue({ subject_id, resource_id, resource_type }, req.body.items);
    return res.json(rows);
  }),
);

// Two static paths that must stay above `/:id`. Express matches in registration
// order, so `/:id` below would otherwise claim them and reject the literal segment
// as a malformed UUID.
// list expiring grants - scoped by caller's authority
router.get(
  '/expiring-soon',
  validate([
    query('within_days').default(30).isInt({ min: 1 }).toInt(),
  ]),
  authorize('grant', 'list'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List grants that are expiring soon (grouped by resource and source)'

    const {
      within_days,
    } = req.query;

    let grantsGrouped;
    if (await callerIsPlatformAdmin(req)) {
      // if platform admin, list all expiring grants
      grantsGrouped = await grantService.listExpiringGrants({
        within_days,
      });
    } else {
      grantsGrouped = await grantService.listExpiringGrantsForAdmin({
        within_days,
        user_id: req.user.subject_id, // scope by caller's authority
      });
    }
    // The service groups by subject and resource. Destructuring `source` here dropped the
    // subject from every row and added an undefined key, so a caller could not say who
    // held the access that is about to lapse.
    // The service scopes the grants to the caller's authority, and the list decision's filter
    // picks each grant's fields.
    res.json(grantsGrouped.map(({ subject, resource, grants }) => ({
      subject: projectObject(subject, baseAttributes.subject),
      resource: projectObject(resource, baseAttributes.resource),
      grants: grants.map((g) => req.permission.filter(g)),
    })));
  }),
);

// list my grants - grouped by resource - optionally filter by active/inactive, resource id
router.get(
  '/mine',
  validate([
    query('is_active').optional().isBoolean().toBoolean(),
    query('resource_id').optional().isUUID(),
    query('expiring_within_days').optional().isInt({ min: 1 }).toInt(),
  ]),
  authorize('grant', 'list'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List my grants'

    const { is_active, resource_id, expiring_within_days } = req.query;
    const rows = await grantService.listMyGrants({
      user_id: req.user.subject_id,
      is_active,
      resource_id,
      expiring_within_days,
    });

    // The service returns only the caller's own grants, and the list decision's filter picks their fields.
    res.json(rows.map((g) => req.permission.filter(g)));
  }),
);

// Get grant by id
router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('grant', 'read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Get grant by ID'

    const grant = await grantService.getGrantById(req.params.id);
    res.status(200).json(req.permission.filter(grant));
  }),
);

// What revoking a grant leaves its subject, for the confirmation modal. The coverage it reads
// counts every path, so the modal never tells an admin a subject loses access they keep.
// @see docs/design/groups/implementation/access-model-verification-plan.md — The UI layer
router.get(
  '/:id/revoke-preview',
  validate([
    param('id').isUUID(),
  ]),
  authorize('grant', 'revoke'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Preview what revoking a grant leaves its subject'
    const preview = await grantService.previewRevoke(req.params.id);
    if (!preview) return next(createError.NotFound('Permission not found'));
    return res.json(preview.map((row) => ({
      ...row,
      still_conferred_by: row.still_conferred_by.map((c) => projectObject(c, baseAttributes.coverage)),
    })));
  }),
);

// Revoke a grant
router.post(
  '/:id/revoke',
  validate([
    param('id').isUUID(),
    body('reason').optional().isString(),
  ]),
  authorize('grant', 'revoke'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Revoke a grant'

    const grantId = req.params.id;
    const { reason } = req.body;

    await grantService.revokeGrant(grantId, { actor_id: req.user.subject_id, reason });
    res.status(204).send();
  }),
);

// Revoke all active grants for a subject on a resource
router.post(
  '/:subject_type/:subject_id/:resource_type/:resource_id/revoke-all',
  validate([
    param('subject_type').isIn(Object.values(SUBJECT_TYPE)),
    param('subject_id').isUUID(),
    param('resource_type').isIn(Object.values(RESOURCE_TYPE)),
    param('resource_id').isUUID(),
    body('reason').optional().isString(),
  ]),
  authorize('grant', 'revoke', {
    resourceIdFn: (req) => req.params.resource_id,
    preFetchedResourceFn: (req) => ({
      resource_id: req.params.resource_id,
      resource_type: req.params.resource_type,
    }),
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Revoke all active grants for a subject on a resource'

    const { subject_id, resource_id } = req.params;
    const { reason } = req.body;

    const revokedGrants = await grantService.revokeAllGrants(
      subject_id,
      resource_id,
      { actor_id: req.user.subject_id, reason },
    );

    res.status(200).json({ revoked: revokedGrants.length });
  }),
);

// List grants for a subject
router.get(
  '/subject/:subject_type/:subject_id',
  validate([
    param('subject_type').isIn(['USER', 'GROUP']),
    param('subject_id').isUUID(),
  ]),
  authorize('grant', 'list_for_subject', {
    resourceIdFn: () => null, // no specific resource to check for listing grants of a subject
    preFetchedResourceFn: (req) => ({
      subject_id: req.params.subject_id,
      subject_type: req.params.subject_type,
    }),
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List grants for a subject (grouped by resource)'

    const { subject_id } = req.params;

    // [{resource, grants: []}, ...]
    const grouped = await grantService.listGrantsForSubjectGrouped({
      subject_id,
    });

    // Each group names a different resource, and a grant's state reads what it concerns as
    // well as its own `revoked_at`. The batch reader fetches the archived and deleted columns
    // the rules need; the hydrated resource above does not carry the owning group.
    const targets = await state.readTargetStates(prisma, grouped.map(({ resource }) => resource.id));
    // Every grant here is for the one user or group in the path.
    const subjectState = await state.readSubjectState(prisma, subject_id);

    const filteredData = grouped.map(({ resource, grants }) => ({
      resource: projectObject(resource, baseAttributes.resource),
      grants: grants.map((g) => ({
        ...req.permission.filter(g),
        _meta: {
          available_actions: state.availableActions('grant', {
            ...g, target: targets.get(resource.id), subject: subjectState,
          }),
        },
      })),
    }));

    res.json(filteredData);
  }),
);

// List grants for a resource
router.get(
  '/resource/:resource_type/:resource_id',
  validate([
    param('resource_type').isIn(Object.values(RESOURCE_TYPE)),
    param('resource_id').isUUID(),
    query('limit').optional().isInt({ min: 0, max: 10 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('access_type_ids').optional().isArray({ min: 1 })
      .custom((value) => value.every((val) => isInt(val, { min: 1 })))
      .bail()
      .customSanitizer((value) => value.map(Number)),
    query('subject_search_term').optional().trim(),
    query('subject_type').optional().isIn(Object.values(SUBJECT_TYPE)),
  ]),
  authorize('grant', 'list_for_resource', {
    resourceIdFn: (req) => req.params.resource_id,
    preFetchedResourceFn: (req) => ({
      resource_id: req.params.resource_id,
      resource_type: req.params.resource_type,
    }),
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List grants for a resource (grouped by subject)'

    const { resource_id } = req.params;
    const options = _.pick(['limit', 'offset', 'access_type_ids', 'subject_search_term', 'subject_type'])(req.query);

    // [{subject, grants: []}, ...]
    const grouped = await grantService.listGrantsForResourceGrouped({
      resource_id,
      ...options,
    });

    // Every grant here concerns the one resource in the path, so its state is a single read
    // and only `revoked_at` separates the rows.
    const target = await state.readTargetState(prisma, resource_id);
    if (!target) throw createError.NotFound('Resource not found');
    // Each group of rows is for one user or group, fetched with its group relation, so issuing
    // reads its state from the row already here.
    const filteredData = grouped.map(({ subject, grants }) => {
      const subjectState = state.subjectOf(subject);
      return {
        subject: projectObject(subject, baseAttributes.subject),
        grants: grants.map((g) => ({
          ...req.permission.filter(g),
          _meta: { available_actions: state.availableActions('grant', { ...g, target, subject: subjectState }) },
        })),
      };
    });

    res.json(filteredData);
  }),
);

// count grants for a resource
router.get(
  '/resource/:resource_type/:resource_id/count',
  validate([
    param('resource_type').isIn(['DATASET', 'COLLECTION']),
    param('resource_id').isUUID(),
  ]),
  authorize('grant', 'list_for_resource', {
    resourceIdFn: (req) => req.params.resource_id,
    preFetchedResourceFn: (req) => ({
      resource_id: req.params.resource_id,
      resource_type: req.params.resource_type,
    }),
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Count grants for a resource'

    const { resource_id } = req.params;

    const count = await grantService.countGrantsForResource({
      resource_id,
    });

    res.json({ count });
  }),
);

// Everything that already reaches a subject on a resource, and how each grant arrives.
// Distinct from the route below, which answers only what the subject holds directly.
// @see docs/design/groups/implementation/access-requests-plan.md — C1
router.get(
  '/:subject_type/:subject_id/:resource_type/:resource_id/coverage',
  validate([
    param('subject_type').isIn(['USER', 'GROUP']),
    param('subject_id').isUUID(),
    param('resource_type').isIn(Object.values(RESOURCE_TYPE)),
    param('resource_id').isUUID(),
  ]),
  authorize('grant', 'view_coverage', {
    resourceIdFn: (req) => req.params.resource_id,
    preFetchedResourceFn: (req) => ({
      subject_id: req.params.subject_id,
      subject_type: req.params.subject_type,
      resource_id: req.params.resource_id,
      resource_type: req.params.resource_type,
    }),
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Every grant reaching a subject on a resource, direct or inherited'

    const { subject_id, resource_id, resource_type } = req.params;

    const coverage = await grantService.getEffectiveCoverage({
      subject_id, resource_id, resource_type,
    });
    const labelled = await grantService.labelCoverage(coverage);
    res.json(labelled.map((row) => projectObject(row, baseAttributes.coverage)));
  }),
);

// Get grants for a specific subject-resource pair
router.get(
  '/:subject_type/:subject_id/:resource_type/:resource_id',
  validate([
    param('subject_type').isIn(['USER', 'GROUP']),
    param('subject_id').isUUID(),
    param('resource_type').isIn(Object.values(RESOURCE_TYPE)),
    param('resource_id').isUUID(),
    query('is_active').optional().isBoolean().toBoolean(),
  ]),
  authorize('grant', 'list_for_resource', {
    resourceIdFn: (req) => req.params.resource_id,
    preFetchedResourceFn: (req) => ({
      resource_id: req.params.resource_id,
      resource_type: req.params.resource_type,
    }),
  }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'Get all grants for a subject on a resource'

    const { subject_id, resource_id } = req.params;
    const { is_active } = req.query;

    const grants = await grantService.getGrantsForSubjectAndResource({
      subject_id,
      resource_id,
      active: is_active,
    });

    // Unlike the grouped lists, this one can be asked for inactive grants, so `revoked_at`
    // separates the rows. The resource is the one in the path, so its state is a single read.
    const target = await state.readTargetState(prisma, resource_id);
    if (!target) throw createError.NotFound('Resource not found');
    const subjectState = await state.readSubjectState(prisma, subject_id);

    const filteredGrants = grants.map((g) => ({
      ...req.permission.filter(g),
      _meta: { available_actions: state.availableActions('grant', { ...g, target, subject: subjectState }) },
    }));
    res.json(filteredGrants);
  }),
);

module.exports = router;
