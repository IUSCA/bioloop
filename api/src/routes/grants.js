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

const router = express.Router();

// List grants (filtered by user authority)
// router.get('/');

router.get(
  '/access-types',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List all access types'

    const accessTypes = await grantService.listAccessTypes();
    res.json(accessTypes);
  }),
);

// List grant presets
router.get(
  '/presets',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Grants']
    // #swagger.summary = 'List all grant presets'

    const presets = await grantService.listPresets();
    res.json(presets);
  }),
);

// Create grants
router.post(
  '/',
  validate([
    body('subject_id').isUUID(),
    body('resource_type').isIn(['DATASET', 'COLLECTION']),
    body('resource_id').isUUID(),
    body('justification').optional().isString(),
    body(('source_preset_id')).optional().isInt(), // if created via a grant preset, link back to the preset item that led to this grant
    body('items').isArray({ min: 1 }),
    body('items.*.access_type_id').optional().isInt(),
    body('items.*.preset_id').optional().isInt(),
    body('items.*.approved_expiry').customSanitizer((val) => Expiry.fromJSON(val)),
    body('items.*').custom((item) => {
      const hasAccessType = item.access_type_id !== undefined && item.access_type_id !== null;
      const hasPreset = item.preset_id !== undefined && item.preset_id !== null;
      if ((hasAccessType && hasPreset) || (!hasAccessType && !hasPreset)) {
        throw new Error('Item must have exactly one of access_type_id or preset_id');
      }
      return true;
    }),
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

    // Validate access_type_id items are unique within the request
    const accessTypeIds = req.body.items
      .filter((item) => item.access_type_id !== undefined)
      .map((item) => item.access_type_id);
    if (new Set(accessTypeIds).size !== accessTypeIds.length) {
      return res.status(400).json({ message: 'Items must have unique access_type_id within the request' });
    }

    // Validate preset_id items are unique within the request
    const presetIds = req.body.items
      .filter((item) => item.preset_id !== undefined)
      .map((item) => item.preset_id);
    if (new Set(presetIds).size !== presetIds.length) {
      return res.status(400).json({ message: 'Items must have unique preset_id within the request' });
    }

    const data = pickNonNil([
      'subject_id',
      'resource_id',
      'justification', 'source_preset_id'])(req.body);
    data.granted_by = req.user.subject_id;
    await grantService.issueGrants(prisma, data, req.body.items);
    res.status(201);
  }),
);

// compute effective grants without creating (dry run) - useful for frontend to preview the effect of a grant creation request, including via presets which may have complex rules and multiple resulting grants
router.post(
  '/compute-effective-grants',
  validate([
    body('subject_id').isUUID(),
    body('resource_type').isIn(['DATASET', 'COLLECTION']),
    body('resource_id').isUUID(),
    body('items').isArray({ min: 1 }),
    body('items.*.access_type_id').optional().isInt(),
    body('items.*.preset_id').optional().isInt(),
    body('items.*.approved_expiry').customSanitizer((val) => Expiry.fromJSON(val)),
    body('items.*').custom((item) => {
      const hasAccessType = item.access_type_id !== undefined && item.access_type_id !== null;
      const hasPreset = item.preset_id !== undefined && item.preset_id !== null;
      if ((hasAccessType && hasPreset) || (!hasAccessType && !hasPreset)) {
        throw new Error('Item must have exactly one of access_type_id or preset_id');
      }
      return true;
    }),
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

    // Validate access_type_id items are unique within the request
    const accessTypeIds = req.body.items
      .filter((item) => item.access_type_id !== undefined)
      .map((item) => item.access_type_id);
    if (new Set(accessTypeIds).size !== accessTypeIds.length) {
      return res.status(400).json({ message: 'Items must have unique access_type_id within the request' });
    }

    // Validate preset_id items are unique within the request
    const presetIds = req.body.items
      .filter((item) => item.preset_id !== undefined)
      .map((item) => item.preset_id);
    if (new Set(presetIds).size !== presetIds.length) {
      return res.status(400).json({ message: 'Items must have unique preset_id within the request' });
    }

    const data = pickNonNil([
      'subject_id',
      'resource_id'])(req.body);
    data.granted_by = req.user.subject_id;

    // [{type: 'new' | 'existing', 'supersede', access_type_id, expiry, existing_grant}]
    const effectiveGrants = await grantService.buildEffectiveGrants(prisma, data, req.body.items);
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
