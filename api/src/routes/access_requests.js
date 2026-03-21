const express = require('express');
const { param, query, body } = require('express-validator');
const _ = require('lodash/fp');
const { RESOURCE_TYPE } = require('@prisma/client');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const accessRequestsService = require('@/services/access_requests');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const { isISO8601 } = require('validator');

const validateUntilDate = (value) => {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  return isISO8601(value, { strict: true });
};

const sanitizeUntilDate = (value) => (value === null ? null : new Date(value));

const router = express.Router();

/**
 * Access Requests Routes
 */

// requests raised by the user
router.get(
  '/requested-by-me',
  validate([
    query('resource_id').optional().isUUID(),
    query('resource_type').optional().isIn(Object.values(RESOURCE_TYPE)),
    query('status').optional().isIn(accessRequestsService.ACCESS_REQUEST_STATES),
    query('sort_by').default('created_at').isIn(['created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access requests raised by the user'

    const requests = await accessRequestsService.getRequestsByUser({
      requester_id: req.user.subject_id,
      status: req.query.status,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      offset: req.query.offset,
      limit: req.query.limit,
      resource_id: req.query.resource_id,
      resource_type: req.query.resource_type,
    });
    // TODO: attribute filter
    res.json(requests);
  }),
);

// Create new request
router.post(
  '/',
  validate([
    body('type').isIn(['NEW']), // 'RENEWAL' is not implemented yet
    body('resource_id').isUUID(),
    body('subject_id').isUUID(), // Who/what this request is for
    body('purpose').isString().notEmpty(),
    body('items').isArray({ min: 1 }),
    body('items.*.access_type_id').optional().isInt(),
    body('items.*.preset_id').optional().isInt(),
    body('items.*.requested_until').optional().isISO8601().toDate(),
    // Custom validator: each item must have exactly one of access_type_id or preset_id
    body('items.*').custom((item) => {
      const hasAccessType = item.access_type_id !== undefined && item.access_type_id !== null;
      const hasPreset = item.preset_id !== undefined && item.preset_id !== null;
      if ((hasAccessType && hasPreset) || (!hasAccessType && !hasPreset)) {
        throw new Error('Item must have exactly one of access_type_id or preset_id');
      }
      return true;
    }),
    // body('previous_grant_ids').optional().isArray({ min: 1 }).custom((arr) => arr.every(isUUID)), not implemented yet
  ]),
  authorize('access_request', 'create'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Create a new access request'

    const data = _.pick(['type', 'resource_id', 'subject_id', 'purpose', 'items'], req.body);

    // Validate access_type_id items are unique within the request
    const accessTypeIds = data.items
      .filter((item) => item.access_type_id !== undefined)
      .map((item) => item.access_type_id);
    if (new Set(accessTypeIds).size !== accessTypeIds.length) {
      return res.status(400).json({ message: 'Items must have unique access_type_id within the request' });
    }

    // Validate preset_id items are unique within the request
    const presetIds = data.items
      .filter((item) => item.preset_id !== undefined)
      .map((item) => item.preset_id);
    if (new Set(presetIds).size !== presetIds.length) {
      return res.status(400).json({ message: 'Items must have unique preset_id within the request' });
    }

    // validated:
    // - user has permission to create request
    // - at least 1 request item and all items are well-formed
    // - request items are unique
    const record = await accessRequestsService.createAccessRequest(data, req.user.subject_id);
    res.status(201).json(req.permission.filter(record));
  }),
);

// get requests requiring user's review
router.get(
  '/my-pending-reviews',
  validate([
    query('resource_id').optional().isUUID(),
    query('resource_type').optional().isIn(Object.values(RESOURCE_TYPE)),
    query('sort_by').default('created_at').isIn(['created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access requests pending user\'s review'

    const {
      sort_by, sort_order, offset, limit, resource_id, resource_type,
    } = req.query;
    const { metadata, data } = await accessRequestsService.getRequestsPendingReviewForUser({
      reviewer_id: req.user.subject_id,
      sort_by,
      sort_order,
      offset,
      limit,
      resource_id,
      resource_type,
    });
    // TODO: attribute filter
    res.json({ metadata, data });
  }),
);

// get requests reviewed by the user
router.get(
  '/reviewed-by-me',
  validate([
    query('resource_id').optional().isUUID(),
    query('resource_type').optional().isIn(Object.values(RESOURCE_TYPE)),
    query('sort_by').default('created_at').isIn(['created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access requests reviewed by the user'

    const {
      sort_by, sort_order, offset, limit, resource_id, resource_type,
    } = req.query;
    const { metadata, data } = await accessRequestsService.getRequestsReviewedByUser({
      user_id: req.user.subject_id,
      sort_by,
      sort_order,
      offset,
      limit,
      resource_id,
      resource_type,
    });
    // TODO: attribute filter
    res.json({ metadata, data });
  }),
);

// get request by id
router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('access_request', 'read'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access request by ID'

    const request = await accessRequestsService.getRequestById(req.params.id);
    res.json(req.permission.filter(request));
  }),
);

// update request - saves as draft; not yet submitted for review
router.put(
  '/:id',
  validate([
    param('id').isUUID(),
    body('purpose').optional().isString().notEmpty(),
    body('items').optional().isArray({ min: 1 }),
    body('items.*.access_type_id').optional().isInt(),
    body('items.*.preset_id').optional().isInt(),
    body('items.*.requested_until')
      .custom(validateUntilDate)
      .withMessage('requested_until must be null or ISO8601 date')
      .customSanitizer(sanitizeUntilDate),
    // Custom validator: each item must have exactly one of access_type_id or preset_id
    body('items.*').custom((item) => {
      const hasAccessType = item.access_type_id !== undefined && item.access_type_id !== null;
      const hasPreset = item.preset_id !== undefined && item.preset_id !== null;
      if ((hasAccessType && hasPreset) || (!hasAccessType && !hasPreset)) {
        throw new Error('Item must have exactly one of access_type_id or preset_id');
      }
      return true;
    }),
  ]),
  authorize('access_request', 'update'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Update an access request (only if it is in DRAFT status)'

    const data = pickNonNil(_.pick(['purpose', 'items'], req.body));

    // Validate items are unique by access_type_id and preset_id if items are provided
    if (data.items) {
      const accessTypeIds = data.items
        .filter((item) => item.access_type_id !== undefined)
        .map((item) => item.access_type_id);
      if (new Set(accessTypeIds).size !== accessTypeIds.length) {
        return res.status(400).json({ message: 'Items must have unique access_type_id within the request' });
      }

      const presetIds = data.items
        .filter((item) => item.preset_id !== undefined)
        .map((item) => item.preset_id);
      if (new Set(presetIds).size !== presetIds.length) {
        return res.status(400).json({ message: 'Items must have unique preset_id within the request' });
      }
    }

    // validated:
    // - user has permission to update request
    // - if purpose or items are provided, they are well-formed and items are unique
    const request = await accessRequestsService.updateAccessRequest(req.params.id, data, req.user.subject_id);
    res.json(req.permission.filter(request));
  }),
);

// submit request
router.post(
  '/:id/submit',
  validate([
    param('id').isUUID(),
  ]),
  authorize('access_request', 'update'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Submit an access request'

    const request = await accessRequestsService.submitRequest(req.params.id, req.user.subject_id);
    res.json(req.permission.filter(request));
  }),
);

// submit review
router.post(
  '/:id/review',
  validate([
    param('id').isUUID(),
    body('item_decisions').isArray({ min: 1 }),
    body('item_decisions.*.id').isUUID(),
    body('item_decisions.*.decision').isIn(['APPROVED', 'REJECTED']),
    body('item_decisions.*.approved_until')
      .custom(validateUntilDate)
      .withMessage('approved_until must be null or ISO8601 date')
      .customSanitizer(sanitizeUntilDate),
    body('decision_reason').isString().notEmpty(),
  ]),
  authorize('access_request', 'review'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Submit review for an access request'

    const options = _.pick(['item_decisions', 'decision_reason'], req.body);
    const reviewResult = await accessRequestsService.submitReview({
      request_id: req.params.id,
      reviewer_id: req.user.subject_id,
      options,
    });
    res.json(req.permission.filter(reviewResult));
  }),
);

// withdraw request
router.post(
  '/:id/withdraw',
  validate([
    param('id').isUUID(),
  ]),
  authorize('access_request', 'update'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Withdraw an access request'

    await accessRequestsService.withdrawRequest({ request_id: req.params.id, requester_id: req.user.subject_id });
    res.status(204).send();
  }),
);

// GET /api/access-requests/renewal-context/:resourceId
// Get context for renewal
// Don't implement now
// router.get('/renewal-context/:resourceId', asyncHandler(async (req, res) => {}));

module.exports = router;
