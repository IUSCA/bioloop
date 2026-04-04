/**
 * Grant Service
 * Manages durable authorization facts
 */

const {
  Prisma, GRANT_REVOCATION_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE, TARGET_TYPE, AuditBuilder } = require('@/authorization/builtin/audit');
const fetchService = require('./fetch');
const issueService = require('./issue');
const helpers = require('./helpers');

/**
 * Revoke a grant
 * @param {string} grant_id - UUID of the grant to revoke
 * @param {string} actor_id - UUID of the user performing the revocation
 * @param {string} [reason] - Optional revocation reason
 * @returns {Promise<Object>} Revoked grant
 */
async function revokeGrant(grant_id, { actor_id, reason }) {
  return prisma.$transaction(async (tx) => {
    // Fetch the grant to get resource_id for authority capture
    const grantToRevoke = await tx.grant.findUniqueOrThrow({
      where: { id: grant_id },
      select: { resource_id: true, revoked_at: true },
    });
    if (grantToRevoke.revoked_at !== null) {
      throw createError.NotFound('Grant not found or already revoked');
    }

    // Capture the revoking authority (owner group of the resource at revocation time)
    const revoking_authority_id = await helpers.getResourceOwnerGroupId(tx, grantToRevoke.resource_id);

    const revokedGrant = await tx.grant.update({
      where: { id: grant_id, revoked_at: null }, // only allow revocation of non-revoked grants
      data: {
        revoked_at: new Date(),
        revoked_by: actor_id,
        revocation_reason: reason ?? Prisma.skip,
        revocation_type: GRANT_REVOCATION_TYPE.MANUAL,
        revoking_authority_id: revoking_authority_id ?? Prisma.skip,
      },
    });

    const builder = new AuditBuilder(tx, { actor_id });
    await builder.setTarget('GRANT', revokedGrant.id);
    await builder.setSubject(revokedGrant.subject_id);
    await builder.setResource(revokedGrant.resource_id);

    const accessType = await tx.grant_access_type.findUnique({
      where: { id: revokedGrant.access_type_id },
      select: { name: true },
    });
    if (accessType) {
      builder.mergeMetadata({ access_type_name: accessType.name });
    }

    await builder.create(tx, AUTH_EVENT_TYPE.GRANT_REVOKED);

    return revokedGrant;
  });
}

/**
 * Revoke all active grants for a subject on a resource in a single transaction.
 * Creates an individual audit record for each revoked grant.
 * @param {string} subject_id - UUID of the subject
 * @param {string} resource_id - UUID of the resource
 * @param {string} actor_id - UUID of the user performing the revocation
 * @param {string} [reason] - Optional revocation reason applied to every revoked grant
 * @returns {Promise<Object[]>} Array of revoked grants
 */
async function revokeAllGrants(subject_id, resource_id, { actor_id, reason }) {
  return prisma.$transaction(async (tx) => {
    const activeGrants = await tx.grant.findMany({
      where: { subject_id, resource_id, revoked_at: null },
      select: { id: true },
    });

    if (activeGrants.length === 0) {
      return [];
    }

    // Capture revoking authority once — same resource for all grants
    const revoking_authority_id = await helpers.getResourceOwnerGroupId(tx, resource_id);

    const now = new Date();

    const revokedGrants = [];

    for (const { id: grant_id } of activeGrants) {
      const revokedGrant = await tx.grant.update({
        where: { id: grant_id, revoked_at: null },
        data: {
          revoked_at: now,
          revoked_by: actor_id,
          revocation_reason: reason ?? Prisma.skip,
          revocation_type: GRANT_REVOCATION_TYPE.MANUAL,
          revoking_authority_id: revoking_authority_id ?? Prisma.skip,
        },
      });
      revokedGrants.push(revokedGrant);
    }

    // Build audit records in batch — one per revoked grant
    const builder = new AuditBuilder(tx, { actor_id });
    await builder.setResource(resource_id);

    const items = await Promise.all(
      revokedGrants.map(async (g) => {
        const accessTypeName = await tx.grant_access_type.findUnique({
          where: { id: g.access_type_id },
          select: { name: true },
        });
        return {
          subject_id: g.subject_id,
          metadata: {
            target_id: g.id,
            target_type: TARGET_TYPE.GRANT,
            access_type_name: accessTypeName?.name,
          },
        };
      }),
    );

    await builder.createBatch(tx, AUTH_EVENT_TYPE.GRANT_REVOKED, items);

    return revokedGrants;
  });
}

module.exports = {
  revokeGrant,
  revokeAllGrants,

  ...helpers,
  ...fetchService,
  ...issueService,
};
