const express = require('express');
const { param, query, body } = require('express-validator');
const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const accessRequestsService = require('@/services/access_requests');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const { pickNonNil } = require('@/utils');

const router = express.Router();

/**
 * Access Requests Routes
 */

// requests raised by the user
router.get(
  '/requested-by-me',
  validate([
    query('status').optional().isIn(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED']),
    query('sort_by').default('created_at').isIn(['created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
    query('offset').default(0).isInt({ min: 0 }),
    query('limit').default(100).isInt({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access requests raised by the user'

    const requests = await accessRequestsService.getRequestsByUser({
      requester_id: req.user.id,
      status: req.query.status,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      offset: req.query.offset,
      limit: req.query.limit,
    });
    res.json(requests);
  }),
);

// Create new request
router.post(
  '/',
  validate([
    body('type').isIn(['NEW']), // 'RENEWAL' is not implemented yet
    body('resource_type').isIn(['DATASET', 'COLLECTION']),
    body('resource_id').isString().notEmpty(),
    body('purpose').isString().notEmpty(),
    body('items').isArray({ min: 1 }),
    body('items.*.access_type_id').isInt(),
    body('items.*.requested_until').optional().isISO8601().toDate(),
    // body('previous_grant_ids').optional().isArray({ min: 1 }).custom((arr) => arr.every(isUUID)), not implemented yet
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Create a new access request'

    const data = _.pick(['type', 'resource_type', 'resource_id', 'purpose', 'items'], req.body);
    const record = await accessRequestsService.createAccessRequest(data, req.user.id);
    res.status(201).json(record);
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
    res.json(request);
  }),
);

// update request - saves as draft; not yet submitted for review
router.put(
  '/:id',
  validate([
    param('id').isUUID(),
    body('purpose').optional().isString().notEmpty(),
    body('items').optional().isArray({ min: 1 }),
    body('items.*.access_type_id').isInt(),
    body('items.*.requested_until').optional().isISO8601().toDate(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Update an access request (only if it is in DRAFT status)'

    const data = pickNonNil(_.pick(['purpose', 'items'], req.body));
    const request = await accessRequestsService.updateAccessRequest(req.params.id, data, req.user.id);
    res.json(request);
  }),
);

// submit request
router.post(
  '/:id/submit',
  validate([
    param('id').isUUID(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Submit an access request'

    const request = await accessRequestsService.submitRequest(req.params.id, req.user.id);
    res.json(request);
  }),
);

// submit review
router.post(
  '/:id/review',
  validate([
    param('id').isUUID(),
    body('item_decisions').isArray({ min: 1 }),
    body('item_decisions.*.id').isInt(),
    body('item_decisions.*.decision').isIn(['APPROVE', 'REJECT']),
    body('item_decisions.*.comment').optional().isString(),
    body('decision_reason').isString().notEmpty(),
  ]),
  authorize('access_request', 'review'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Submit review for an access request'

    const options = _.pick(['item_decisions', 'decision_reason'], req.body);
    const reviewResult = await accessRequestsService.submitReview({
      request_id: req.params.id,
      reviewer_id: req.user.id,
      options,
    });
    res.json(reviewResult);
  }),
);

// withdraw request
router.post(
  '/:id/withdraw',
  validate([
    param('id').isUUID(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Withdraw an access request'

    await accessRequestsService.withdrawRequest({ request_id: req.params.id, requester_id: req.user.id });
    res.status(204).send();
  }),
);

// get requests requiring user's review
router.get(
  '/my-pending-reviews',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access requests pending user\'s review'

    const {
      sort_by, sort_order, offset, limit,
    } = req.query;
    const requests = await accessRequestsService.getRequestsPendingReviewForUser({
      reviewer_id: req.user.id,
      sort_by,
      sort_order,
      offset,
      limit,
    });
    res.json(requests);
  }),
);

// get requests reviewed by the user
router.get(
  '/reviewed-by-me',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access requests reviewed by the user'

    const {
      sort_by, sort_order, offset, limit,
    } = req.query;
    const requests = await accessRequestsService.getReviewedRequestsByUser({
      user_id: req.user.id,
      sort_by,
      sort_order,
      offset,
      limit,
    });
    res.json(requests);
  }),
);

// GET /api/access-requests/renewal-context/:resourceId
// Get context for renewal
// Don't implement now
// router.get('/renewal-context/:resourceId', asyncHandler(async (req, res) => {}));

module.exports = router;
