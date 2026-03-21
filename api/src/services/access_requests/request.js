const {
  Prisma, ACCESS_REQUEST_STATUS, ACCESS_REQUEST_ITEM_DECISION, SUBJECT_TYPE, GROUP_MEMBER_ROLE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const { TARGET_TYPE } = require('@/authorization/builtin/audit');
const { resolveEntityName, resolveResources, resolveSubjects } = require('@/authorization/builtin/audit/helpers');
const { _getRequestById } = require('./fetch');

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
    throw createError.NotFound('Subject not found');
  }

  // Self-request: subject must exactly match requester subject and must be a USER subject
  if (subject_id === requester_id) {
    if (subject.type !== SUBJECT_TYPE.USER) {
      throw createError.Forbidden('Self access request must target a user subject');
    }
    return;
  }

  // Group request: subject must be a GROUP and requester must be ADMIN of that group
  if (subject.type === SUBJECT_TYPE.GROUP) {
    const isAdmin = await tx.group_user.findFirst({
      where: {
        group_id: subject_id,
        user_id: requester_id,
        role: GROUP_MEMBER_ROLE.ADMIN,
      },
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
 * @param {Array<{access_type_id?: number, preset_id?: number, requested_until?: Date}>} data.items - Access types or presets being requested, must be unique within the request. Each item must have exactly one of access_type_id or preset_id.
 * @param {string[]} [data.previous_grant_ids] - For renewals, reference to expired grants
 * @param {string} requester_id - UUID of the user creating the request
 * @returns {Promise<Object>} Created access request
 */
async function createAccessRequest(data, requester_id) {
  return prisma.$transaction(async (tx) => {
    await _validateAccessRequestSubject(tx, requester_id, data.subject_id);

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
          requested_until: item.requested_until ?? Prisma.skip,
          decision: ACCESS_REQUEST_ITEM_DECISION.PENDING,
        })),
      });
    }

    // Create audit record for request creation
    const requesterName = await resolveEntityName(tx, 'user', requester_id);
    const resourceMap = await resolveResources(tx, [data.resource_id]);
    const subjectMap = await resolveSubjects(tx, [data.subject_id]);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_CREATED,
        actor_id: requester_id,
        actor_name: requesterName,
        subject_id: data.subject_id,
        subject_name: subjectMap[data.subject_id]?.name ?? Prisma.skip,
        subject_type: subjectMap[data.subject_id]?.type ?? Prisma.skip,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: accessRequest.id,
        metadata: {
          resource_id: data.resource_id,
          resource_type: resourceMap[data.resource_id]?.type || null,
          resource_name: resourceMap[data.resource_id]?.name || null,
          status: ACCESS_REQUEST_STATUS.DRAFT,
        },
      },
    });

    // Return updated request with items
    return _getRequestById(tx, accessRequest.id);
  });
}

/**
 * Update a DRAFT access request
 * @param {string} request_id
 * @param {string} actor_id - UUID of the user updating the request
 * @param {Object} data
 * @param {string} [data.purpose] - Updated justification
 * @param {Array<{access_type_id?: number, preset_id?: number, requested_until?: Date}>} [data.items] - Updated items (replaces existing). Each item must have exactly one of access_type_id or preset_id.
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
    const { status } = rows[0];
    if (status !== ACCESS_REQUEST_STATUS.DRAFT) {
      throw createError.Conflict('Request is not in DRAFT status');
    }

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
          requested_until: item.requested_until ?? Prisma.skip,
          decision: ACCESS_REQUEST_ITEM_DECISION.PENDING,
        })),
      });
    }

    // Create audit record
    const requesterName = await resolveEntityName(tx, 'user', actor_id);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_UPDATED,
        actor_id,
        actor_name: requesterName,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: request_id,
      },
    });

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
 * @param {Object} request - access_request with access_request_items included
 */
async function _assertNoInFlightRequests(request) {
  const accessTypeIds = request.access_request_items.map((item) => item.access_type_id).filter((id) => id !== null);
  const presetIds = request.access_request_items.map((item) => item.preset_id).filter((id) => id !== null);

  const conflicting = await prisma.access_request.findMany({
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
async function submitRequest(request_id, actor_id) {
  // Fetch the request with items for pre-flight validation
  const request = await _getRequestById(prisma, request_id);
  if (!request || request.status !== ACCESS_REQUEST_STATUS.DRAFT) {
    throw createError.Conflict('Request is no longer in DRAFT status');
  }

  // assert request has at least one item
  if (!request.access_request_items || request.access_request_items.length === 0) {
    throw createError.BadRequest('Cannot submit request without any request items');
  }

  // Reject if another in-flight request covers any of the same request items
  await _assertNoInFlightRequests(request);

  return prisma.$transaction(async (tx) => {
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

    // Create audit record
    const actorName = await resolveEntityName(tx, 'user', actor_id);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.REQUEST_SUBMITTED,
        actor_id,
        actor_name: actorName,
        target_type: TARGET_TYPE.ACCESS_REQUEST,
        target_id: request_id,
        metadata: {
          from_status: ACCESS_REQUEST_STATUS.DRAFT,
          to_status: ACCESS_REQUEST_STATUS.UNDER_REVIEW,
        },
      },
    });

    return _getRequestById(tx, request_id);
  });
}

module.exports = { createAccessRequest, updateAccessRequest, submitRequest };
