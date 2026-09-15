const express = require('express');
const { param, query, body } = require('express-validator');
const _ = require('lodash/fp');
const { RESOURCE_TYPE, ACCESS_REQUEST_ITEM_DECISION } = require('@prisma/client');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const accessRequestsService = require('@/services/access_requests');
const grantService = require('@/services/grants');
const {
  createAuthorizationMiddleware: authorize, authorizeAction, toCapabilitiesArray, decideRows,
} = require('@/authorization');
const { pickNonNil } = require('@/utils');
const Expiry = require('@/utils/expiry');
const prisma = require('@/db');

// Which policy container governs a resource of each type.
const POLICY_RESOURCE_TYPE = {
  [RESOURCE_TYPE.DATASET]: 'dataset',
  [RESOURCE_TYPE.COLLECTION]: 'collection',
};

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
    const metas = await decideRows('access_request', requests.data, { req, idOf: (r) => r.id, action: 'read' });
    res.json({ ...requests, data: requests.data.map((r, i) => ({ ...r, _meta: metas[i] })) });
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
    body('items.*.requested_expiry').customSanitizer((value) => Expiry.fromJSON(value)), // convert to Expiry instance; throws if invalid
    // Custom validator: each item must have exactly one of access_type_id or preset_id
    body('items.*').custom((item) => {
      const hasAccessType = item.access_type_id !== undefined && item.access_type_id !== null;
      const hasPreset = item.preset_id !== undefined && item.preset_id !== null;
      if ((hasAccessType && hasPreset) || (!hasAccessType && !hasPreset)) {
        throw new Error('Item must have exactly one of access_type_id or preset_id');
      }
      return true;
    }),
    // Submitting in the same call is what the UI does; see the handler for why.
    body('submit').optional().isBoolean().toBoolean(),
    // body('previous_grant_ids').optional().isArray({ min: 1 }).custom((arr) => arr.every(isUUID)), not implemented yet
  ]),
  // The restriction half of authorization. `restrictionTargetFor` follows an access_request
  // through to the resource it concerns, so this is what stops a request being filed against
  // a dataset in an archived group. The policy half is `Policy.always`; the real check is on
  // the resource and runs in the handler, because the body carries no resource type.
  authorize('access_request', 'create', {
    preFetchedResourceFn: (req) => ({ resource_id: req.body.resource_id }),
  }),
  asyncHandler(async (req, res, next) => {
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

    // validate requested expiry is in the future
    for (const item of data.items) {
      if (item.requested_expiry.hasExpired()) {
        return res.status(400).json({ message: 'requested_expiry must be in the future' });
      }
    }

    // A request may only be filed against a resource the requester can already see. Posture
    // B.5 in the use cases sets that bar: seeing the metadata is what makes asking possible.
    // The body names a resource id and no resource type, so the container to authorize
    // against is not known until the row is read, and an authorize() middleware cannot pick
    // it. The policy context is threaded through so the caller is hydrated once.
    // @see docs/design/groups/access-requests-plan.md — A1
    const resource = await prisma.resource.findUnique({
      where: { id: data.resource_id },
      select: { id: true, type: true },
    });
    if (!resource) {
      return next(createError.NotFound('Resource not found'));
    }

    const decision = await authorizeAction(POLICY_RESOURCE_TYPE[resource.type], 'view_metadata', {
      identifiers: { user: req.user?.subject_id, resource: resource.id },
      policyExecutionContext: req.policyContext,
      preFetched: { user: req.user, context: { req } },
    });
    if (!decision.granted) {
      return next(decision.status === 404
        ? createError.NotFound('Resource not found')
        : createError.Forbidden('Not permitted to request access to this resource'));
    }

    // The same rule grant creation applies: a COLLECTION access type cannot be asked for on
    // a dataset. Throws a 400 naming the offending access type or preset.
    await grantService.assertGrantItemsApplicableToResourceType(prisma, resource.type, data.items);
    // A type only an admin grants, such as sensitive metadata, cannot be asked for.
    await grantService.assertItemsRequestable(prisma, data.items);

    // validated:
    // - the requester can see the resource, and no restriction blocks filing against it
    // - at least 1 request item and all items are well-formed
    // - request items are unique, and applicable to the resource type
    //
    // `submit: true` creates the request and puts it under review in one transaction. A
    // DRAFT is invisible — no surface lists one — so two client calls would strand a row
    // the requester could neither see nor resume if the second failed.
    // @see docs/design/groups/access-requests-plan.md — B1
    const record = req.body.submit
      ? await accessRequestsService.createAndSubmitAccessRequest(data, req.user.subject_id)
      : await accessRequestsService.createAccessRequest(data, req.user.subject_id);
    return res.status(201).json(req.permission.filter(record));
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
    const metas = await decideRows('access_request', data, { req, idOf: (r) => r.id, action: 'read' });
    res.json({ metadata, data: data.map((r, i) => ({ ...r, _meta: metas[i] })) });
  }),
);

// get requests reviewed by the user
router.get(
  '/reviewed-by-me',
  validate([
    query('resource_id').optional().isUUID(),
    query('resource_type').optional().isIn(Object.values(RESOURCE_TYPE)),
    // `reviewed_at` is the ordering this list wants and is populated on every row in it,
    // so it is accepted here and nowhere else.
    query('sort_by').default('reviewed_at').isIn(['created_at', 'updated_at', 'reviewed_at']),
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
    const metas = await decideRows('access_request', data, { req, idOf: (r) => r.id, action: 'read' });
    res.json({ metadata, data: data.map((r, i) => ({ ...r, _meta: metas[i] })) });
  }),
);

// get request by id
router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  // The detail page offers a Review control, and the three policies that admit a reader here
  // are not the one that admits a reviewer: a requester and an oversight holder can both read
  // a request neither may decide.
  authorize('access_request', 'read', { shouldDeriveCapabilities: true }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Get access request by ID'

    const request = await accessRequestsService.getRequestById(req.params.id);
    res.json({
      ...req.permission.filter(request),
      _meta: {
        capabilities: toCapabilitiesArray(req.permission.capabilities),
      },
    });
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
    body('items.*.requested_expiry')
      .customSanitizer((value) => Expiry.fromJSON(value)), // convert to Expiry instance; throws if invalid
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

    // validate requested expiry is in the future
    if (data.items) {
      for (const item of data.items) {
        if (item.requested_expiry.hasExpired()) {
          return res.status(400).json({ message: 'requested_expiry must be in the future' });
        }
      }
      await grantService.assertItemsRequestable(prisma, data.items);
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
  authorize('access_request', 'submit'),
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
    body('item_decisions.*.decision').isIn([
      ACCESS_REQUEST_ITEM_DECISION.APPROVED,
      ACCESS_REQUEST_ITEM_DECISION.REJECTED,
    ]),
    // An APPROVED decision carries the expiry its grant is issued with; a REJECTED one carries
    // nothing, so the field is checked per decision rather than by a wildcard rule on the
    // field itself. `Expiry.validate` throws the reason and express-validator answers 400.
    // Without this the handler's `Expiry.fromJSON` raised a TypeError, and a review that
    // approved anything without an expiry came back as a 500.
    body('item_decisions.*').custom((decision) => {
      if (decision?.decision === ACCESS_REQUEST_ITEM_DECISION.APPROVED) {
        Expiry.validate(decision.approved_expiry);
      }
      return true;
    }),
    body('decision_reason').isString().notEmpty(),
  ]),
  authorize('access_request', 'review'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Access Requests']
    // #swagger.summary = 'Submit review for an access request'

    const options = _.pick(['item_decisions', 'decision_reason'], req.body);

    // validate item_decisions have unique ids
    const itemDecisionIds = options.item_decisions.map((d) => d.id);
    if (new Set(itemDecisionIds).size !== itemDecisionIds.length) {
      return res.status(400).json({ message: 'item_decisions must have unique ids' });
    }

    // convert approved_expiry to Expiry instances for approved items; also validates approved_expiry format
    options.item_decisions = options.item_decisions.map((d) => {
      if (d.decision === 'APPROVED') {
        return { ...d, approved_expiry: Expiry.fromJSON(d.approved_expiry) };
      }
      return d;
    });

    // validate approved expiry for approved items is in the future
    for (const itemDecision of options.item_decisions) {
      if (itemDecision.decision === 'APPROVED' && itemDecision.approved_expiry.hasExpired()) {
        return res.status(400).json({ message: 'approved_expiry must be in the future for approved items' });
      }
    }

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
  authorize('access_request', 'withdraw'),
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
