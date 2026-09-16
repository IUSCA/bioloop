const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');

/**
 * What a grant's state admits.
 *
 * A grant is revoked once. A revoked grant is history, and revoking it again is a conflict rather
 * than a second revocation. Issuing and revoking both read the resource's state as well, because
 * an archived resource's access stops changing.
 *
 * @see docs/design/groups/design.md — Grants: The Core Authorization Primitive
 */

function targetRefusal(grant) {
  const { target } = grant;
  if (target.deleted) {
    return refuse(`The ${target.kind} this permission applies to is deleted.`, { state: 'deleted' });
  }
  if (target.archived) {
    return refuse(
      `The ${target.kind} this permission applies to is archived, so its access cannot change.`,
      { state: 'archived' },
    );
  }
  return null;
}

const grantState = new StateContainer({
  resourceType: 'grant',
  description: "What a grant's revoked state and its resource's state admit",
  examples: {
    // An open grant on an archived resource. The dialog asking what archiving stops does not
    // know which kind of resource, so the example names it generically.
    archived: { revoked_at: null, target: { kind: 'resource', archived: true, deleted: false } },
  },
}).rules({
  create: rule({
    requires: ['target.archived', 'target.deleted', 'target.kind'],
    check: targetRefusal,
  }),

  revoke: rule({
    requires: ['revoked_at', 'target.archived', 'target.deleted', 'target.kind'],
    check: (grant) => (grant.revoked_at != null
      ? refuse('This permission is already revoked.', { state: 'revoked' })
      : targetRefusal(grant)),
  }),

  read: always,
  list_for_resource: always,
  list_for_subject: always,
  view_coverage: always,
});

module.exports = { grantState };
