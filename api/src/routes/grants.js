const express = require('express');
const { param, query, body } = require('express-validator');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const grantService = require('@/services/grants');
const { isPlatformAdmin } = require('@/services/auth');
const Expiry = require('@/utils/expiry');
const prisma = require('@/db');
const { RESOURCE_TYPE } = require('@prisma/client');

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
    query('resource_type').isIn(Object.values(RESOURCE_TYPE)),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List all access types'

    const accessTypes = await grantService.listAccessTypes();

    // for collections, return all access types
    // for datasets, filter out access types that are only applicable to datasets
    if (req.query.resource_type === RESOURCE_TYPE.DATASET) {
      const filteredAccessTypes = accessTypes.filter(({ name }) => name.startsWith('DATASET:'));
      return res.json(filteredAccessTypes);
    }

    res.json(accessTypes);
  }),
);

// List grant presets
router.get(
  '/presets',
  validate([query('resource_type').optional().isIn(Object.values(RESOURCE_TYPE))]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List all grant presets'

    const presets = await grantService.listPresets(req.query.resource_type);
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

    const data = pickNonNil([
      'subject_id',
      'resource_id',
      'resource_type',
    ])(req.body);
    data.granted_by = req.user.subject_id;

    // [{type: 'new' | 'existing' | 'supersede', access_type_id: int, expiry: Expiry, existing_grant: Object?}]
    // expiry is the latest approved expiry for the access type, either from preset or directly from the item, that would result from the request
    const effectiveGrants = await prisma.$transaction(
      (tx) => grantService.buildEffectiveGrants(tx, data, req.body.items),
    );
    res.json(effectiveGrants);
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

// List grants for a subject - admins
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

    const filteredData = grouped.map(({ resource, grants }) => ({
      resource,
      grants: grants.map((g) => req.permission.filter(g)),
    }));

    res.json(filteredData);
  }),
);

// List grants for a resource - admins
router.get(
  '/resource/:resource_type/:resource_id',
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
    // #swagger.summary = 'List grants for a resource (grouped by subject)'

    const { resource_id } = req.params;

    // [{subject, grants: []}, ...]
    const grouped = await grantService.listGrantsForResourceGrouped({
      resource_id,
    });

    const filteredData = grouped.map(({ subject, grants }) => ({
      subject,
      grants: grants.map((g) => req.permission.filter(g)),
    }));

    res.json(filteredData);
  }),
);

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
    if (isPlatformAdmin(req)) {
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
    const filteredGrants = grantsGrouped.map(({ resource, source, grants }) => ({
      resource,
      source,
      grants: grants.map((g) => req.permission.filter(g)),
    }));
    res.json(filteredGrants);
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

    const filteredData = rows.map((g) => req.permission.filter(g));

    res.json(filteredData);
  }),
);

// list my expiring grants

module.exports = router;
