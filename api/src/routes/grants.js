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

// List grants for a subject
router.get(
  '/subject/:subject_type/:subject_id',
  validate([
    param('subject_type').isIn(['USER', 'GROUP']),
    param('subject_id').isUUID(),
    query('active').optional().isBoolean().toBoolean(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
    query('sort_by').default('created_at').isIn(['created_at', 'valid_from', 'valid_to']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
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
    const {
      active, offset, limit, sort_by, sort_order,
    } = req.query;

    const grants = await grantService.listGrantsForSubject({
      subject_id,
      active,
      offset,
      limit,
      sort_by,
      sort_order,
    });
    const filteredGrants = grants.data.map((g) => req.permission.filter(g));
    res.json({
      metadata: grants.metadata,
      data: filteredGrants,
    });
  }),
);

// List grants for a resource
router.get(
  '/resource/:resource_type/:resource_id',
  validate([
    param('resource_type').isIn(['DATASET', 'COLLECTION']),
    param('resource_id').isUUID(),
    query('active').optional().isBoolean().toBoolean(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
    query('sort_by').default('created_at').isIn(['created_at', 'valid_from', 'valid_to']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
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
    const {
      active, offset, limit, sort_by, sort_order,
    } = req.query;

    const grants = await grantService.listGrantsForResource({
      resource_id,
      active,
      offset,
      limit,
      sort_by,
      sort_order,
    });
    const filteredGrants = grants.data.map((g) => req.permission.filter(g));
    res.json({
      metadata: grants.metadata,
      data: filteredGrants,
    });
  }),
);

// list expiring grants - scoped by caller's authority
router.get(
  '/expiring-soon',
  validate([
    query('within_days').default(30).isInt({ min: 1 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
    query('sort_by').default('valid_to').isIn(['created_at', 'valid_from', 'valid_to']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
  ]),
  authorize('grant', 'list'),
  asyncHandler(async (req, res) => {
    const {
      within_days, offset, limit, sort_by, sort_order,
    } = req.query;

    let grants;
    if (isPlatformAdmin(req)) {
      // if platform admin, list all expiring grants
      grants = await grantService.listExpiringGrants({
        within_days,
        offset,
        limit,
        sort_by,
        sort_order,
      });
    } else {
      grants = await grantService.listExpiringGrantsForAdmin({
        within_days,
        offset,
        limit,
        sort_by,
        sort_order,
        user_id: req.user.subject_id, // scope by caller's authority
      });
    }
    const filteredGrants = grants.data.map((g) => req.permission.filter(g));
    res.json({
      metadata: grants.metadata,
      data: filteredGrants,
    });
  }),
);

// router.post('/search', asyncHandler(async (req, res) => {
//   // #swagger.tags = ['Grants']
//   // #swagger.summary = 'Search grants with complex filters (admin-only)'

//   if (isPlatformAdmin(req)) {} else {}
// }));

module.exports = router;
