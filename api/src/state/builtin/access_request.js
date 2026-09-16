const { ACCESS_REQUEST_STATUS } = require('@prisma/client');

const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');

/**
 * What an access request's state admits.
 *
 * A request carries a status, names a resource, and is for a user or a group. The status decides
 * which step is next: a decided request is a record and never changes again. Archiving freezes
 * everything it covers, so no step moves while the resource is not open or while the request is
 * for an archived group. Nothing is cancelled either: unarchiving lets every step resume where it
 * stopped. Only the expiry job, which runs on time rather than on a person's action, still closes
 * a request under review.
 *
 * @see docs/design/groups/design.md — Lifecycle Management
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 2
 */

const { DRAFT, UNDER_REVIEW } = ACCESS_REQUEST_STATUS;

const statusRefusal = (statuses, what) => (request) => (statuses.includes(request.status)
  ? null
  : refuse(
    `This request is ${request.status.toLowerCase().replace(/_/g, ' ')}, and only ${what}.`,
    { state: request.status },
  ));

/**
 * Whether archiving has frozen the request. `target` comes from `readTargetState`, and `subject`
 * from `readSubjectState` or `subjectOf`.
 */
function frozenRefusal(request) {
  const { target, subject } = request;
  if (target.deleted) {
    return refuse(`The ${target.kind} this request concerns is deleted.`, { state: 'deleted' });
  }
  if (target.archived) {
    return refuse(`The ${target.kind} this request concerns is archived.`, { state: 'archived' });
  }
  if (subject.archived) {
    return refuse('The group this request is for is archived.', { state: 'archived' });
  }
  return null;
}

const FROZEN_FIELDS = ['target.archived', 'target.deleted', 'target.kind', 'subject.archived'];

/** A step that needs the request unfrozen and in one of `statuses`. */
const step = (statuses, what) => rule({
  requires: ['status', ...FROZEN_FIELDS],
  check: (request) => frozenRefusal(request) || statusRefusal(statuses, what)(request),
});

const accessRequestState = new StateContainer({
  resourceType: 'access_request',
  description: "What a request's status, its resource's state, and its group's state admit",
  examples: {
    // A draft on an archived resource. The status is the one that admits the most steps, so
    // every action this lists is refused by the archived resource rather than by the status.
    archived: {
      status: ACCESS_REQUEST_STATUS.DRAFT,
      target: { kind: 'resource', archived: true, deleted: false },
      subject: { kind: 'user', archived: false },
    },
  },
}).rules({
  create: rule({
    requires: FROZEN_FIELDS,
    check: frozenRefusal,
  }),

  update: step([DRAFT], 'a draft can be edited'),
  submit: step([DRAFT], 'a draft can be submitted'),
  // Withdrawing is frozen too. It takes nothing away, but a freeze that let one step move would
  // be a rule with an exception, and the request is still there to withdraw after unarchiving.
  withdraw: step([DRAFT, UNDER_REVIEW], 'a draft or a request under review can be withdrawn'),
  review: step([UNDER_REVIEW], 'a request under review can be reviewed'),

  read: always,
});

module.exports = { accessRequestState };
