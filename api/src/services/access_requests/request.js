const {
  Prisma, ACCESS_REQUEST_STATUS, ACCESS_REQUEST_ITEM_DECISION, SUBJECT_TYPE, GROUP_MEMBER_ROLE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const state = require('@/state');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const AuditBuilder = require('@/authorization/builtin/audit/AuditBuilder');
const { _getRequestById } = require('./fetch');
const { notifyReviewersOfSubmission } = require('./notify');

/**
 * Validates that the requester can create an access request for the specified subject.
 * - If the subject is the requester themselves, always allowed.
 * - If the subject is a group, the requester must be an admin of that group to request on behalf of it.
 * - Requesting on behalf of another user is not allowed.
 * @param {Object} tx - Prisma transaction client
 * @param {string} requester_id - UUID of the user making the request
 * @param {string} subject_id - UUID of the subject for whom access is being requested
 * @throws {NotFound} If the subject does not exist
 * @throws {Forbidden} If the requester is not allowed to request for the specified subject
 */
async function _validateAccessRequestSubject(tx, requester_id, subject_id) {
  const subject = await tx.subject.findUnique({
    where: { id: subject_id },
  });

  if (!subject) {
    throw createError.NotFound('User or group not found');
  }

  // Self-request: subject must exactly match requester subject and must be a USER subject
  if (subject_id === requester_id) {
    if (subject.type !== SUBJECT_TYPE.USER) {
      throw createError.Forbidden('A request for yourself must name a user, not a group');
    }
    return;
  }

  // Group request: subject must be a GROUP and requester must be ADMIN of that group
  if (subject.type === SUBJECT_TYPE.GROUP) {
    const isAdmin = await tx.active_group_user.findFirst({
      where: { group_id: subject_id, user_id: requester_id, role: GROUP_MEMBER_ROLE.ADMIN },
    });

    if (isAdmin) {
      return;
    }

    throw createError.Forbidden('Requester must be an admin of the requested group');
  }

  // All other-user requests are not allowed
  throw createError.Forbidden('Requesting on behalf of another user is not allowed');
}

/**
 * Create a new access request
 * @param {Object} data
 * @param {string} data.type - 'NEW' or 'RENEWAL'
 * @param {string} data.resource_id - UUID of the resource
 * @param {string} data.subject_id - UUID of the subject (user or group) for whom access is being requested
 * @param {string} [data.purpose] - Justification for the request
 * @param {Array<{access_type_id?: number, preset_id?: number, requested_expiry?: Expiry}>} data.items - Access types or presets being requested, must be unique within the request. Each item must have exactly one of access_type_id or preset_id.
 * @param {string[]} [data.previous_grant_ids] - For renewals, reference to expired grants
 * @param {string} requester_id - UUID of the user creating the request
 * @returns {Promise<Object>} Created access request
 */
async function _createAccessRequest(tx, data, requester_id) {
  await _validateAccessRequestSubject(tx, requester_id, data.subject_id);

  // A request is worth filing only on a resource whose state still admits access changes.
  state.assertPossible('access_request', 'create', {
    target: await state.readTargetState(tx, data.resource_id),
  });

  // Create the access request
  const accessRequest = await tx.access_request.create({
    data: {
      type: data.type,
      resource_id: data.resource_id,
      requester_id,
      subject_id: data.subject_id,
      purpose: data.purpose ?? Prisma.skip,
      previous_grant_ids: data.previous_grant_ids ?? Prisma.skip,
      status: ACCESS_REQUEST_STATUS.DRAFT,
    },
  });

  // Create access request items (each with either access_type_id or preset_id, never both)
  if (data.items && data.items.length > 0) {
    await tx.access_request_item.createMany({
      data: data.items.map((item) => ({
        access_request_id: accessRequest.id,
        access_type_id: item.access_type_id ?? Prisma.skip,
        preset_id: item.preset_id ?? Prisma.skip,
        requested_until: item.requested_expiry ? item.requested_expiry.toValue() : Prisma.skip,
        decision: ACCESS_REQUEST_ITEM_DECISION.PENDING,
      })),
    });
  }

  // create audit log
  const builder = new AuditBuilder(tx, { actor_id: requester_id });
  await builder
    .setTarget('ACCESS_REQUEST', accessRequest.id)
    .setSubject(data.subject_id)
    .setResource(data.resource_id);

  builder.mergeMetadata({
    status: ACCESS_REQUEST_STATUS.DRAFT,
  });

  await builder.create(tx, AUTH_EVENT_TYPE.REQUEST_CREATED);

  // Return updated request with items
  return _getRequestById(tx, accessRequest.id);
}

/**
 * Create a new access request in its own transaction.
 * @see _createAccessRequest for the parameters.
 */
async function createAccessRequest(data, requester_id) {
  return prisma.$transaction((tx) => _createAccessRequest(tx, data, requester_id));
}

/**
 * Update a DRAFT access request
 * @param {string} request_id
 * @param {string} actor_id - UUID of the user updating the request
 * @param {Object} data
 * @param {string} [data.purpose] - Updated justification
 * @param {Array<{access_type_id?: number, preset_id?: number, requested_expiry?: Expiry}>} [data.items] - Updated items (replaces existing). Each item must have exactly one of access_type_id or preset_id.
 * @returns {Promise<Object>} Updated access request
 */
async function updateAccessRequest(request_id, actor_id, data) {
  return prisma.$transaction(async (tx) => {
    // get a row-level lock on the request to prevent concurrent updates
    // Ensure request is still in DRAFT to prevent updates on requests that are already submitted or closed
    const rows = await tx.$queryRaw`
      SELECT id, status
      FROM access_request 
      WHERE 
        id = ${request_id}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw createError.NotFound();
    }
    // The WHERE guards below keep the write atomic; this names the state first.
    state.assertPossible('access_request', 'update', rows[0]);

    if (data.purpose) {
      await tx.access_request.update({
        where: { id: request_id },
        data: { purpose: data.purpose },
      });
    }

    // If items are provided, replace existing items
    // items must not be empty if provided
    if (data.items && data.items.length > 0) {
      // Delete existing items
      await tx.access_request_item.deleteMany({
        where: { access_request_id: request_id },
      });

      // Create new items
      await tx.access_request_item.createMany({
        data: data.items.map((item) => ({
          access_request_id: request_id,
          access_type_id: item.access_type_id ?? Prisma.skip,
          preset_id: item.preset_id ?? Prisma.skip,
          requested_until: item.requested_expiry ? item.requested_expiry.toValue() : Prisma.skip,
          decision: ACCESS_REQUEST_ITEM_DECISION.PENDING,
        })),

      });
    }

    // Use AuditBuilder
    const builder = new AuditBuilder(tx, { actor_id });

    const requestWithRelations = await tx.access_request.findUnique({
      where: { id: request_id },
      include: {
        resource: { include: { dataset: true, collection: true } },
        subject: { include: { user: true, group: true } },
      },
    });

    await builder
      .setTarget('ACCESS_REQUEST', request_id)
      .setSubject(requestWithRelations?.subject_id)
      .setResource(requestWithRelations?.resource_id);

    await builder.create(tx, AUTH_EVENT_TYPE.REQUEST_UPDATED);

    // Return updated request with items
    return _getRequestById(tx, request_id);
  });
}

/**
 * Throws if the subject already has another UNDER_REVIEW request for the same
 * resource that overlaps with any of the items in this request (direct or preset-expanded).
 *
 * Ex: If the request has items access type A and preset P,
 * then this will throw if there is another UNDER_REVIEW request for the same subject and resource that has any of:
 * - access type A
 * - preset P (which includes access types B and C)
 *
 * If another UNDER_REVIEW request exists with access type B and Preset Q (which includes access types C and D),
 * this should allow the current request since there is no direct overlap of request items(B and Q are different from A and P),
 * justification: We want to deduplicate user intent not resolved access types. This other deduplication is handled at approval / grant creation time.
 *
 * This is a pre-flight check for submitting a request, to prevent multiple concurrent requests for the same access types which would cause confusion for reviewers and potential
 *
 * @param {Object} tx - Prisma client or transaction client
 * @param {Object} request - access_request with access_request_items included
 */
async function _assertNoInFlightRequests(tx, request) {
  const accessTypeIds = request.access_request_items.map((item) => item.access_type_id).filter((id) => id !== null);
  const presetIds = request.access_request_items.map((item) => item.preset_id).filter((id) => id !== null);

  const conflicting = await tx.access_request.findMany({
    where: {
      id: { not: request.id },
      subject_id: request.subject_id,
      resource_id: request.resource_id,
      status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
      access_request_items: {
        some: {
          OR: [
            { access_type_id: { in: accessTypeIds } },
            { preset_id: { in: presetIds } },
          ],
        },
      },
    },
    include: {
      access_request_items: {
        select: { id: true, access_type_id: true, preset_id: true },
      },
    },
  });

  if (conflicting.length > 0) {
    // need to throw error, so gather conflicting access type and preset ids for error details
    const conflictingAccessTypeIds = new Set();
    const conflictingPresetIds = new Set();
    const conflictingRequestIds = new Set();

    for (const otherRequest of conflicting) {
      for (const item of otherRequest.access_request_items) {
        if (item.access_type_id) {
          conflictingAccessTypeIds.add(item.access_type_id);
        }
        if (item.preset_id) {
          conflictingPresetIds.add(item.preset_id);
        }
      }
      conflictingRequestIds.add(otherRequest.id);
    }

    throw createError.Conflict(
      'One or more pending requests already exist for some of the same access types or presets',
      {
        details: {
          access_type_ids: Array.from(conflictingAccessTypeIds),
          preset_ids: Array.from(conflictingPresetIds),
          request_ids: Array.from(conflictingRequestIds),
        },
      },
    );
  }
}

/**
 * Submit a DRAFT request for review
 * @param {string} request_id
 * @param {string} actor_id - UUID of the user submitting the request, who can submit is enforced by authorization policies, not this service method
 * @returns {Promise<Object>} Updated access request
 */
async function _submitRequest(tx, request_id, actor_id) {
  // Fetch the request with items for pre-flight validation
  const request = await _getRequestById(tx, request_id);
  if (!request) throw createError.NotFound('Request not found');
  state.assertPossible('access_request', 'submit', {
    status: request.status,
    target: await state.readTargetState(tx, request.resource_id),
  });

  // assert request has at least one item
  if (!request.access_request_items || request.access_request_items.length === 0) {
    throw createError.BadRequest('Cannot submit request without any request items');
  }

  // Reject if another in-flight request covers any of the same request items
  await _assertNoInFlightRequests(tx, request);

  // Update status to UNDER_REVIEW — WHERE status='DRAFT' guards against concurrent submit races
  const updated = await tx.access_request.updateMany({
    where: {
      id: request_id,
      status: ACCESS_REQUEST_STATUS.DRAFT, // Ensure request is still in DRAFT to prevent race conditions
    },
    data: {
      status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
      submitted_at: new Date(),
    },
  });
  if (updated.count !== 1) {
    throw createError.Conflict('Request is no longer in DRAFT status');
  }

  // Use AuditBuilder
  const builder = new AuditBuilder(tx, { actor_id });
  await builder
    .setTarget('ACCESS_REQUEST', request_id)
    .setSubject(request.subject_id)
    .setResource(request.resource_id);

  builder.mergeMetadata({
    from_status: ACCESS_REQUEST_STATUS.DRAFT,
    to_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
  });

  await builder.create(tx, AUTH_EVENT_TYPE.REQUEST_SUBMITTED);

  return _getRequestById(tx, request_id);
}

/**
 * Submit a DRAFT request for review, in its own transaction.
 * @see _submitRequest for the parameters.
 */
async function submitRequest(request_id, actor_id) {
  const request = await prisma.$transaction((tx) => _submitRequest(tx, request_id, actor_id));
  // After the commit, and never able to fail it: a notification that cannot be delivered
  // must not undo a submission. @see docs/design/groups/implementation/access-requests-plan.md — D1
  await notifyReviewersOfSubmission(request);
  return request;
}

/**
 * Create a request and put it under review in one transaction.
 *
 * A request that is created and not submitted is invisible: no surface lists DRAFT rows and
 * no queue holds them, so a failure between two client calls would strand a row the
 * requester could neither see nor resume. Both states and both audit events are kept — only
 * the round trip disappears.
 *
 * @see docs/design/groups/implementation/access-requests-plan.md — B1
 * @param {Object} data - as for createAccessRequest
 * @param {string} requester_id - UUID of the user creating the request
 * @returns {Promise<Object>} the request, UNDER_REVIEW
 */
async function createAndSubmitAccessRequest(data, requester_id) {
  const request = await prisma.$transaction(async (tx) => {
    const created = await _createAccessRequest(tx, data, requester_id);
    return _submitRequest(tx, created.id, requester_id);
  });
  await notifyReviewersOfSubmission(request);
  return request;
}

module.exports = {
  createAccessRequest,
  createAndSubmitAccessRequest,
  updateAccessRequest,
  submitRequest,
};
