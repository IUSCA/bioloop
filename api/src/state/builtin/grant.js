const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');
const { TARGET_SELECT, SUBJECT_SELECT, shapeTargetAndSubject } = require('./targets');

/**
 * What a grant's state admits.
 *
 * A grant is revoked once. A revoked grant is history, and revoking it again is a conflict rather
 * than a second revocation. Issuing and revoking both read the resource's state as well, because
 * an archived resource's access stops changing.
 *
 * Issuing also reads the group the grant is for: an archived group is frozen, so it takes no new
 * access. Revoking does not read it. The grant sits on a resource another group governs, and that
 * group is not frozen, so its admins must still be able to take the access away.
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
  // A grant that does not exist yet, as issuing checks it, is a row of just `resource` and
  // `subject`, fetched with the two relations' selects.
  select: {
    revoked_at: true,
    resource: { select: TARGET_SELECT },
    subject: { select: SUBJECT_SELECT },
  },
  shape: (row) => shapeTargetAndSubject(row, ['revoked_at']),
  examples: {
    // An open grant on an archived resource. The dialog asking what archiving stops does not
    // know which kind of resource, so the example names it generically.
    archived: {
      revoked_at: null,
      target: { kind: 'resource', archived: true, deleted: false },
      subject: { kind: 'user', archived: false },
    },
  },
}).rules({
  create: rule({
    requires: ['target.archived', 'target.deleted', 'target.kind', 'subject.archived'],
    check: (grant) => targetRefusal(grant)
      || (grant.subject.archived
        ? refuse('This access is for an archived group, which cannot be given new access.', { state: 'archived' })
        : null),
  }),

  revoke: rule({
    requires: ['revoked_at', 'target.archived', 'target.deleted', 'target.kind'],
    check: (grant) => (grant.revoked_at != null
      ? refuse('This permission is already revoked.', { state: 'revoked' })
      : targetRefusal(grant)),
  }),

  read: always,
  list: always,
  list_for_resource: always,
  list_for_subject: always,
  view_coverage: always,
});

module.exports = { grantState };
