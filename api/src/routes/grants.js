const express = require('express');
const { param, query, body } = require('express-validator');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const grantService = require('@/services/grants');
const { isPlatformAdmin } = require('@/services/auth');

const router = express.Router();

// List grants (filtered by user authority)
// router.get('/');

router.get(
  '/access-types',
  asyncHandler(async (req, res) => {
    const accessTypes = await grantService.listAccessTypes();
    res.json(accessTypes);
  }),
);

// List grant presets
router.get(
  '/presets',
  asyncHandler(async (req, res) => {
    const presets = await grantService.listPresets();
    res.json(presets);
  }),
);

// Create a grant
router.post(
  '/',
  validate([
    body('subject_type').isIn(['USER', 'GROUP']),
    body('subject_id').isUUID(),
    body('resource_type').isIn(['DATASET', 'COLLECTION']),
    body('resource_id').isUUID(),
    body('access_type_id').isInt(),
    body('justification').optional().isString(),
    body('valid_from').optional().isISO8601(),
    body('valid_to').optional().isISO8601(),
  ]),
  authorize('grant', 'create', {
    resourceIdFn: () => null, // no specific resource to check for create
    preFetchedResourceFn: (req) => ({
      resource_id: req.body.resource_id,
      resource_type: req.body.resource_type,
    }), // we need the resource attributes to evaluate the policy
  }),
  asyncHandler(async (req, res) => {
    // validate valid_from < valid_to if both provided
    const { valid_from, valid_to } = req.body;
    if (valid_from && valid_to && new Date(valid_from) >= new Date(valid_to)) {
      throw createError(400, 'valid_from must be before valid_to');
    }

    const data = pickNonNil([
      'subject_type', 'subject_id',
      'resource_type', 'resource_id',
      'access_type_id',
      'valid_from', 'valid_to',
      'justification'])(req.body);
    const granted_by = req.user.subject_id;
    const grant = await grantService.createGrant(data, granted_by);
    res.status(201).json(req.permission.filter(grant));
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
