/**
 * Grant Service
 * Manages durable authorization facts
 */

const {
  Prisma, GRANT_REVOCATION_TYPE,
} = require('@prisma/client');
const createError = require('http-errors');

const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('@/authorization/builtin/audit/events');
const { resolveEntityName, resolveGrant } = require('@/authorization/builtin/audit/helpers');

const { TARGET_TYPE } = require('@/authorization/builtin/audit');
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

    // create audit record for grant revocation
    const actorName = await resolveEntityName(tx, 'user', actor_id);
    const fullGrant = await resolveGrant(tx, revokedGrant.id);

    await tx.authorization_audit.create({
      data: {
        event_type: AUTH_EVENT_TYPE.GRANT_REVOKED,
        actor_id,
        actor_name: actorName,
        subject_id: fullGrant.subject_id,
        subject_name: fullGrant.subject.name,
        subject_type: fullGrant.subject.type,
        metadata: {
          resource_id: fullGrant.resource_id,
          resource_type: fullGrant.resource.type,
          resource_name: fullGrant.resource.name,
          access_type_name: fullGrant.access_type.name,
        },
        target_type: TARGET_TYPE.GRANT,
        target_id: fullGrant.id,
      },
    });

    return revokedGrant;
  });
}

module.exports = {
  revokeGrant,

  ...helpers,
  ...fetchService,
  ...issueService,
};
