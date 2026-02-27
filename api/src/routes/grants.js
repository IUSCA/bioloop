const express = require('express');
const { param, query, body } = require('express-validator');
const createError = require('http-errors');
const { isUUID, isInt } = require('validator');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const grantService = require('@/services/grants');

const router = express.Router();

function validateSubjectId(subject_type, subject_id) {
  if (subject_type === 'GROUP') {
    if (!isUUID(subject_id)) {
      throw createError(400, 'Invalid subject_id for GROUP (must be UUID)');
    }
  } else if (subject_type === 'USER') {
    if (!isInt(subject_id)) {
      throw createError(400, 'Invalid subject_id for USER (must be integer)');
    }
  } else {
    throw createError(400, 'Invalid subject_type (must be USER or GROUP)');
  }
  return true;
}

// List grants (filtered by user authority)
// router.get('/');

// Create a grant
router.post(
  '/',
  validate([
    body('subject_type').isIn(['USER', 'GROUP']),
    body('subject_id').custom((value, { req }) => validateSubjectId(req.body.subject_type, value)),
    body('resource_type').isIn(['DATASET', 'COLLECTION']),
    body('resource_id').isInt(),
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
    const granted_by = req.user.id;
    const grant = await grantService.createGrant(data, granted_by);
    res.status(201).json(grant);
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
    res.status(200).json(grant);
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

    await grantService.revokeGrant(grantId, { actor_id: req.user.id, reason });
    res.status(204).send();
  }),
);

// List grants for a subject
router.get(
  '/subject/:subjectType/:subjectId',
  validate([
    param('subjectType').isIn(['USER', 'GROUP']),
    param('subjectId').custom((value, { req }) => validateSubjectId(req.params.subjectType, value)),
    query('active').optional().isBoolean().toBoolean(),
    query('offset').optional().isInt().toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sort_by').optional().isIn(['created_at', 'valid_from', 'valid_to']),
    query('sort_order').optional().isIn(['asc', 'desc']),
  ]),
  authorize('grant', 'list_for_subject', {
    resourceIdFn: () => null, // no specific resource to check for listing grants of a subject
    preFetchedResourceFn: (req) => ({
      subject_id: req.params.subjectId,
      subject_type: req.params.subjectType,
    }),
  }),
  asyncHandler(async (req, res) => {
    const { subjectType, subjectId } = req.params;

    const grants = await grantService.listGrantsForSubject(subjectType, subjectId);
    res.json(grants);
  }),
);

// List grants for a resource
router.get(
  '/resource/:resourceType/:resourceId',
  validate([
    param('resourceType').isIn(['DATASET', 'COLLECTION']),
    param('resourceId').isInt(),
  ]),
  authorize('grant', 'list_for_resource', {
    resourceIdFn: (req) => req.params.resourceId,
    preFetchedResourceFn: (req) => ({
      resource_id: req.params.resourceId,
      resource_type: req.params.resourceType,
    }),
  }),
  asyncHandler(async (req, res) => {
    const { resourceType, resourceId } = req.params;
    const grants = await grantService.listGrantsForResource(resourceType, resourceId);
    res.json(grants);
  }),
);

module.exports = router;
