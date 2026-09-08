const { Prisma } = require('@prisma/client');

const prisma = require('@/db');

/**
 * Writing side of the restriction layer. The reading side, and the classification of which
 * actions each type blocks, live in `authorization/builtin/restrictions.js`.
 *
 * @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
 */

const RESTRICTION_TYPE = {
  ARCHIVED: 'ARCHIVED',
};

/**
 * Put a restriction in force on a group or a resource.
 *
 * Idempotent: a partial unique index allows one open restriction of a type per target, and
 * a second call leaves the first row alone rather than opening a duplicate.
 *
 * @param {Object} tx - Prisma transaction client. Callers pass their own so the restriction
 *   and the state it describes are written together.
 * @param {Object} params
 * @param {string} params.type_name
 * @param {string} [params.group_id]
 * @param {string} [params.resource_id]
 * @param {string} [params.actor_id] - subject_id of whoever applied it
 * @param {string} [params.reason]
 */
async function applyRestriction(tx, {
  type_name, group_id = null, resource_id = null, actor_id = null, reason = null,
}) {
  if ((group_id === null) === (resource_id === null)) {
    throw new Error('A restriction attaches to exactly one of a group or a resource');
  }

  // Raw SQL because ON CONFLICT has to name the partial index predicate, which Prisma's
  // upsert cannot express.
  const target = group_id
    ? Prisma.sql`${group_id}, NULL`
    : Prisma.sql`NULL, ${resource_id}`;
  const conflictTarget = group_id
    ? Prisma.sql`("group_id", "type_name") WHERE "lifted_at" IS NULL AND "group_id" IS NOT NULL`
    : Prisma.sql`("resource_id", "type_name") WHERE "lifted_at" IS NULL AND "resource_id" IS NOT NULL`;

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "restriction" ("type_name", "group_id", "resource_id", "applied_by", "reason")
    VALUES (${type_name}, ${target}, ${actor_id}, ${reason})
    ON CONFLICT ${conflictTarget} DO NOTHING
  `);
}

/**
 * Lift the restriction of this type in force on a target, if there is one.
 *
 * Closes the row rather than deleting it, so the history of what was restricted, by whom,
 * and for how long survives. Returns the number of rows closed, which is 0 or 1.
 */
async function liftRestriction(tx, {
  type_name, group_id = null, resource_id = null, actor_id = null,
}) {
  if ((group_id === null) === (resource_id === null)) {
    throw new Error('A restriction attaches to exactly one of a group or a resource');
  }

  const clause = group_id
    ? Prisma.sql`"group_id" = ${group_id}`
    : Prisma.sql`"resource_id" = ${resource_id}`;

  return tx.$executeRaw(Prisma.sql`
    UPDATE "restriction"
    SET "lifted_at" = CURRENT_TIMESTAMP, "lifted_by" = ${actor_id}
    WHERE ${clause} AND "type_name" = ${type_name} AND "lifted_at" IS NULL
  `);
}

/**
 * Every restriction ever applied to a target, open and lifted, newest first.
 * The history is the reason rows are closed rather than deleted.
 */
async function restrictionHistory({ group_id = null, resource_id = null }) {
  return prisma.restriction.findMany({
    where: group_id ? { group_id } : { resource_id },
    orderBy: { applied_at: 'desc' },
  });
}

module.exports = {
  RESTRICTION_TYPE,
  applyRestriction,
  liftRestriction,
  restrictionHistory,
};
