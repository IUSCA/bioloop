const {
  Prisma, GRANT_CREATION_TYPE, RESOURCE_TYPE, GRANT_REVOCATION_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const { resolveEntityName } = require('@/authorization/builtin/audit/helpers');
const Expiry = require('@/utils/expiry');
const audit = require('@/authorization/builtin/audit');
const AuditBuilder = require('@/authorization/builtin/audit/AuditBuilder');
const prisma = require('@/db');
const { getPrismaGrantValidityFilter } = require('./fetch');
const {
  getResourceOwnerGroupId,
} = require('./helpers');

// ============================================================================
// Grant Creation
// ============================================================================

const GRANT_OVERLAP_ERROR_MSG = 'An active grant with overlapping validity already exists'
  + ' for this subject, resource, and access type';

/**
 * Create a grant (direct authorization)
 * @param {Object} data
 * @param {string} data.subject_id - UUID of either user of group
 * @param {string} data.resource_id - UUID of either dataset or collection
 * @param {string} data.access_type_id - GRANT_ACCESS_TYPE enum
 * @param {Date} [data.valid_from] - Defaults to now
 * @param {Expiry} data.expiry - instance of Expiry class; must be provided
 * @param {string} [data.creation_type] - GRANT_CREATION_TYPE enum, defaults to MANUAL
 * @param {string} data.granted_by - UUID of the user performing the grant
 * @param {string} [data.justification] - Optional justification for the grant creation
 * @param {string} [data.issuing_authority_id] - Optional UUID of the authority to capture on the grant (e.g. owner group of the resource); if not provided, will be looked up based on the resource
 * @param {string} [data.source_access_request_id] - Optional UUID of the access request that triggered this grant (if applicable)
 * @param {string} [data.source_preset_id] - Optional UUID of the grant preset that triggered this grant (if applicable)
 * @param {Object} [auditData] - Optional additional data for the audit record
 * @param {Object} [txn] - Optional Prisma transaction; if not provided, a new transaction will be used for the operation
 * @returns {Promise<Object>} Created grant
 */
async function _createGrant(tx, data, auditData = {}) {
  // Capture the issuing authority (owner group of the resource at grant creation time)
  let { issuing_authority_id } = data;
  if (data.issuing_authority_id === undefined) {
    issuing_authority_id = await getResourceOwnerGroupId(tx, data.resource_id);
  }

  let grant;
  try {
    grant = await tx.grant.create({
      data: {
        subject_id: data.subject_id,
        resource_id: data.resource_id,
        access_type_id: data.access_type_id,
        creation_type: data.creation_type ?? GRANT_CREATION_TYPE.MANUAL,
        valid_from: data.valid_from ?? Prisma.skip,
        valid_until: data.expiry.toValue(),
        granted_by: data.granted_by,
        justification: data.justification ?? Prisma.skip,
        issuing_authority_id,
        source_access_request_id: data.source_access_request_id ?? Prisma.skip,
        source_preset_id: data.source_preset_id ?? Prisma.skip,
      },
    });
  } catch (e) {
    // catch unique constraint violation on valid grant overlap and throw a 409 with a clear message instead of the generic Prisma error
    if (e.message.includes('grant_no_overlap')) {
      throw createError.Conflict(GRANT_OVERLAP_ERROR_MSG);
    }
    throw e;
  }

  // Use AuditBuilder for consistent audit record creation
  const builder = new AuditBuilder(tx, { actor_id: data.granted_by });
  await builder
    .setTarget('GRANT', grant.id)
    .setSubject(data.subject_id)
    .setResource(data.resource_id);

  // Resolve access type name into metadata
  const accessTypeName = await resolveEntityName(tx, 'grant_access_type', data.access_type_id);
  if (accessTypeName) {
    builder.mergeMetadata({ access_type_name: accessTypeName });
  }

  // Merge any caller-provided audit data metadata
  if (auditData && auditData.metadata) {
    builder.mergeMetadata(auditData.metadata);
  }

  // Determine event type - use provided or default to GRANT_CREATED
  const auditEventType = auditData?.event_type || audit.AUTH_EVENT_TYPE.GRANT_CREATED;
  await builder.create(tx, auditEventType);

  return grant;
}

/**
 * Create a single grant (backwards compatibility wrapper for legacy createGrant API - used for testing)
 * @param {Object} data - grant fields (subject_id, resource_id, access_type_id, valid_from?, valid_until?, etc.)
 * @param {string} granted_by - user ID performing grant creation
 */
async function createGrant(data, granted_by) {
  if (!data || typeof data !== 'object') {
    throw new Error('grant data must be provided');
  }
  if (!granted_by) {
    throw new Error('granted_by is required');
  }

  let { expiry } = data;

  if (!(data.expiry instanceof Expiry)) {
    expiry = (data.valid_until === undefined || data.valid_until === null
      ? Expiry.never()
      : Expiry.at(data.valid_until));
  }

  const grantData = {
    ...data,
    granted_by,
    expiry,
  };

  return prisma.$transaction((tx) => _createGrant(tx, grantData));
}

/**
 * Check whether a non-revoked grant already exists that would overlap with the requested validity window.
 * Uses half-open interval semantics [valid_from, valid_until) matching the DB exclusion constraint.
 * Kept as an explicit pre-flight helper for callers that want early ORM-level feedback before hitting the DB.
 */
// eslint-disable-next-line no-unused-vars
async function _assertNoOverlappingGrant(tx, data) {
  const newFrom = data.valid_from ? new Date(data.valid_from) : new Date();
  const newUntil = data.valid_until ? new Date(data.valid_until) : null;

  // Overlap condition for [newFrom, newUntil) vs [existingFrom, existingUntil):
  //   existingFrom < newUntil  (infinity if newUntil is null → always true)
  //   newFrom < existingUntil  (infinity if existingUntil is null → always true)
  const conflicting = await tx.grant.findFirst({
    where: {
      subject_id: data.subject_id,
      resource_id: data.resource_id,
      access_type_id: Number(data.access_type_id),
      revoked_at: null,
      AND: [
        // existingFrom < newUntil (skip if newUntil is null → ∞, so always overlaps)
        ...(newUntil ? [{ valid_from: { lt: newUntil } }] : []),
        // newFrom < existingUntil (existingUntil null → ∞, so always overlaps)
        {
          OR: [
            { valid_until: null },
            { valid_until: { gt: newFrom } },
          ],
        },
      ],
    },
    select: { id: true },
  });

  if (conflicting) {
    throw createError.Conflict(GRANT_OVERLAP_ERROR_MSG);
  }
}

// ============================================================================
// Grant Bulk Creation
// ============================================================================

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Items must be a non-empty array');
  }

  for (const item of items) {
    if ((item.access_type_id && item.preset_id) || (!item.access_type_id && !item.preset_id)) {
      throw new Error('Each item must have either access_type_id or preset_id, but not both');
    }
    if (!(item.approved_expiry instanceof Expiry)) {
      throw new Error('Each item must have an approved_expiry of type Expiry');
    }
  }
}

// Build a map of preset_id -> [access_type_id, ...] for quick lookup when processing approved items
async function buildPresetIdToAccessTypeIdsMap(tx, presetIds) {
  const presets = await tx.grant_preset.findMany({
    where: { id: { in: presetIds }, is_active: true },
    include: { access_type_items: true },
  });
  return new Map(presets.map((p) => [p.id, p.access_type_items.map((i) => i.access_type_id)]));
}

async function fetchExistingGrants(tx, { subject_id, resource_id, accessTypeIds }) {
  const where = getPrismaGrantValidityFilter(true); // use new Date() to filter for currently valid grants
  where.subject_id = subject_id;
  where.resource_id = resource_id;
  where.access_type_id = { in: accessTypeIds };

  const existingGrants = await tx.grant.findMany({
    where,
  });

  // Build a map of access_type_id -> existing active grant (if any)
  const existingGrantMap = new Map();
  for (const grant of existingGrants) {
    existingGrantMap.set(grant.access_type_id, grant);
  }
  return existingGrantMap;
}

class GrantIssueService {
  /**
   *
   * @param {Object} params
   * @param {Object} params.subject_id - The subject for which the grant(s) are being issued (e.g. user or group)
   * @param {Object} params.resource_id - The resource for which the grant(s) are being issued (e.g. dataset or collection)
   * @param {string} params.granted_by - The ID of the user who is issuing the grant(s)
   * @param {number} [params.source_preset_id] - The ID of the grant preset that triggered the grant issuance (if applicable)
   * @param {string} [params.access_request_id] - The ID of the access request that triggered the grant issuance (if applicable)
   * @param {string} [params.justification] - The justification provided for issuing the grant(s)

   */
  constructor({
    subject_id, resource_id, granted_by, source_preset_id, access_request_id, justification,
  } = {}) {
    // if access_request_id is provided, source_preset_id must not be provided
    // if source_preset_id is provided, access_request_id must not be provided
    // both can be null/undefined
    if (access_request_id && source_preset_id) {
      throw new Error('Cannot provide both access_request_id and source_preset_id');
    }

    this.creation_type = access_request_id ? GRANT_CREATION_TYPE.ACCESS_REQUEST : GRANT_CREATION_TYPE.MANUAL;

    this.subject_id = subject_id;
    this.resource_id = resource_id;
    this.source_preset_id = source_preset_id;
    this.access_request_id = access_request_id;
    this.justification = justification;
    this.granted_by = granted_by;
    this.metadata = {};
  }

  async _hydrateMetadata(tx) {
    const subject = await tx.subject.findUniqueOrThrow({
      where: { id: this.subject_id },
      include: { user: true, group: true },
    });
    this.metadata.subjectName = subject.user ? subject.user.name : subject.group.name;
    this.metadata.subjectType = subject.type;

    const resource = await tx.resource.findUniqueOrThrow({
      where: { id: this.resource_id },
      include: { dataset: true, collection: true },
    });
    this.metadata.resourceName = resource.type === RESOURCE_TYPE.DATASET
      ? resource.dataset.name
      : resource.collection.name;
    this.metadata.resourceType = resource.type;
    this.metadata.resourceOwnerGroupId = resource.type === RESOURCE_TYPE.DATASET
      ? resource.dataset.owner_group_id
      : resource.collection.owner_group_id;

    this.metadata.actorName = await resolveEntityName(tx, 'user', this.granted_by);
  }

  // Build a map: access_type_id -> latest approved_until date from any item providing it
  async _buildAccessTypeIdToExpirationsMap(tx) {
    const accessTypeExpirations = new Map();

    const presetIds = this.items.filter((i) => i.preset_id).map((i) => i.preset_id);
    const presetIdAccessTypeIdsMap = await buildPresetIdToAccessTypeIdsMap(tx, presetIds);

    for (const item of this.items) {
      let itemAccessTypeIds = []; // access types provided by this item, either directly or via preset

      if (item.access_type_id) {
        itemAccessTypeIds = [item.access_type_id];
      } else if (item.preset_id) {
        itemAccessTypeIds = presetIdAccessTypeIdsMap.get(item.preset_id) || [];
      }

      // Record or update expiration for each access type
      for (const accessTypeId of itemAccessTypeIds) {
        const existing = accessTypeExpirations.get(accessTypeId);
        const newExpiration = item.approved_expiry;

        // Use the later (more distant) expiration date
        accessTypeExpirations.set(accessTypeId, Expiry.selectLater(existing, newExpiration));
      }
    }

    return accessTypeExpirations;
  }

  async _createNewGrant(tx, { valid_from, expiry, access_type_id }) {
    const data = {
      subject_id: this.subject_id,
      resource_id: this.resource_id,
      access_type_id,
      creation_type: this.creation_type,
      valid_from,
      expiry,
      granted_by: this.granted_by,
      justification: this.justification,
      source_access_request_id: this.access_request_id,
      issuing_authority_id: this.metadata.resourceOwnerGroupId,
      source_preset_id: this.source_preset_id,
    };
    const auditData = { actor_name: this.metadata.actorName };
    return _createGrant(tx, data, auditData);
  }

  async _createAuditRecordForSkippedGrant(tx, existingGrant, accessTypeId) {
    // The audit record notes that no grant was created because an existing grant with a later expiry already covers this access type,
    // referencing the existing grant ID.
    // Only create audit record if this grant issuance is tied to an access request
    if (!this.access_request_id) {
      return;
    }

    const builder = new AuditBuilder(tx, { actor_id: this.granted_by });
    await builder
      .setTarget('ACCESS_REQUEST', this.access_request_id)
      .setSubject(this.subject_id)
      .setResource(this.resource_id);

    builder.mergeMetadata({
      reason: 'Existing active grant with later expiration already covers this access type',
      existing_grant_id: existingGrant.id,
      access_type_id: accessTypeId,
      existing_grant_valid_until: existingGrant.valid_until,
    });

    await builder.create(tx, audit.AUTH_EVENT_TYPE.GRANT_CREATION_SKIPPED);
  }

  async _supersedeGrant(tx, existingGrant, { valid_from, expiry, access_type_id }) {
    // Revoke the existing grant with revocation_type = SUPERSEDED
    await tx.grant.update({
      where: { id: existingGrant.id },
      data: {
        revoked_at: valid_from, // set revoked_at to the valid_from of the new grant to indicate when the old grant stopped being effective
        revocation_type: GRANT_REVOCATION_TYPE.SUPERSEDED,
        revoking_authority_id: this.metadata.resourceOwnerGroupId,
      },
    });

    // Create a new grant
    const data = {
      subject_id: this.subject_id,
      resource_id: this.resource_id,
      access_type_id,
      creation_type: this.creation_type,
      valid_from,
      expiry,
      granted_by: this.granted_by,
      justification: this.justification,
      source_access_request_id: this.access_request_id,
      issuing_authority_id: this.metadata.resourceOwnerGroupId,
      source_preset_id: this.source_preset_id,
    };
    const auditData = {
      actor_name: this.metadata.actorName,
      event_type: audit.AUTH_EVENT_TYPE.GRANT_SUPERSEDED,
      metadata: {
        reason: 'Existing active grant with earlier expiration superseded by new grant with later expiration',
        existing_grant_id: existingGrant.id,
        existing_grant_valid_until: existingGrant.valid_until,
      },
    };
    return _createGrant(tx, data, auditData);
  }

  /**
   * Issues grants for the subject/resource
   *
   * @param {Object} tx - Prisma transaction
   * @param {Array} items
   * @param {number} items[].access_type_id - The access type to grant (e.g. read, write, etc.)
   * @param {number} items[].grant_preset_id - The grant preset to apply which determines the access type and duration of the grant. Mutually exclusive with access_type_id.
   * @param {Expiry} items[].approved_expiry - valid_until time for the grant.
   * @param {Object} options - Additional options for issuing grants.
   */
  async issue(tx, items) {
    const effectiveGrants = await this.buildEffectiveGrants(tx, items);
    await this._hydrateMetadata(tx);

    const now = new Date(); // use the same timestamp for all grants created in this batch for consistency

    for (const effectiveGrant of effectiveGrants) {
      if (effectiveGrant.type === 'new') {
        await this._createNewGrant(tx, {
          valid_from: now,
          expiry: effectiveGrant.expiry,
          access_type_id: effectiveGrant.access_type_id,
        });
      } else if (effectiveGrant.type === 'existing') {
        await this._createAuditRecordForSkippedGrant(tx, effectiveGrant.existingGrant, effectiveGrant.access_type_id);
      } else if (effectiveGrant.type === 'supersede') {
        await this._supersedeGrant(tx, effectiveGrant.existingGrant, {
          valid_from: now,
          expiry: effectiveGrant.expiry,
          access_type_id: effectiveGrant.access_type_id,
        });
      }
    }
  }

  async buildEffectiveGrants(tx, items) {
    validateItems(items);
    this.items = items;

    const accessTypeExpirations = await this._buildAccessTypeIdToExpirationsMap(tx);

    // access_type_id -> existing active grant (if any) for the same subject/resource/ access type
    const existingGrantMap = await fetchExistingGrants(tx, {
      subject_id: this.subject_id,
      resource_id: this.resource_id,
      accessTypeIds: Array.from(accessTypeExpirations.keys()),
    });

    const effectiveGrants = [];

    for (const [accessTypeId, expiry] of accessTypeExpirations.entries()) {
      const existingGrant = existingGrantMap.get(accessTypeId);

      if (!existingGrant) {
      // case-1: no existing grant - new grant would be created
        effectiveGrants.push({
          type: 'new',
          access_type_id: accessTypeId,
          expiry,
        });
      } else if (Expiry.compare(existingGrant.expiry, expiry) >= 0) {
        // case-2: existing grant with equal or later valid_until than the approved_until - existing grant remains effective
        effectiveGrants.push({
          type: 'existing',
          access_type_id: accessTypeId,
          expiry: existingGrant.expiry,
          existingGrant,
        });
      } else {
        // case-3: existing grant with earlier valid_until than the approved_until - new grant would supersede the existing grant
        effectiveGrants.push({
          type: 'supersede',
          access_type_id: accessTypeId,
          expiry,
          existingGrant,
        });
      }
    }
    return effectiveGrants;
  }
}

/**
 * Issues grants based on the provided parameters and items.
 *
 * @param {Object} params - The same parameters as the GrantIssueService constructor
 * @param {Array} items - An array of items, each containing either access_type_id or preset_id, and an approved_expiry of type Expiry
 */
function issueGrants(tx, params, items) {
  const service = new GrantIssueService(params);
  return service.issue(tx, items);
}

/**
 * Determines the effective grants that would result from issuing grants with the given items, without actually creating or modifying any grants.
 * This is useful for previewing the outcome of a grant issuance before committing to it.
 *
 * @param {Object} params - The same parameters as the GrantIssueService constructor
 * @param {Array} items - The same items array as the issue method
 * @returns {Array} An array of effective grants with their type (new, existing, supersede) and relevant details
 */
function buildEffectiveGrants(tx, params, items) {
  const service = new GrantIssueService(params);
  return service.buildEffectiveGrants(tx, items);
}

module.exports = {
  createGrant,
  issueGrants,
  buildEffectiveGrants,
  GrantIssueService, // exported for testing purposes
};
