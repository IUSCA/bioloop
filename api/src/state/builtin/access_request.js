const { ACCESS_REQUEST_STATUS } = require('@prisma/client');

const StateContainer = require('../core/StateContainer');
const { rule, always, refuse } = require('../core/rules');

/**
 * What an access request's state admits.
 *
 * A request carries a status, and it names a resource. The status decides which step is next: a
 * decided request is a record and never changes again. The resource's state decides whether the
 * request can be acted on at all, because approving one on an archived resource would issue a
 * grant the resource's state forbids.
 *
 * @see docs/design/groups/design.md — Access Requests Workflow
 */

const { DRAFT, UNDER_REVIEW } = ACCESS_REQUEST_STATUS;

const statusRefusal = (statuses, what) => (request) => (statuses.includes(request.status)
  ? null
  : refuse(
    `This request is ${request.status.toLowerCase().replace(/_/g, ' ')}, and only ${what}.`,
    { state: request.status },
  ));

/** The resource a request names. `target` comes from `readTargetState`. */
function targetRefusal(request) {
  const { target } = request;
  if (target.deleted) {
    return refuse(`The ${target.kind} this request concerns is deleted.`, { state: 'deleted' });
  }
  if (target.archived) {
    return refuse(`The ${target.kind} this request concerns is archived.`, { state: 'archived' });
  }
  return null;
}

const accessRequestState = new StateContainer({
  resourceType: 'access_request',
  description: "What a request's status and its resource's state admit",
}).rules({
  create: rule({
    requires: ['target.archived', 'target.deleted', 'target.kind'],
    check: targetRefusal,
  }),

  update: rule({
    requires: ['status'],
    check: statusRefusal([DRAFT], 'a draft can be edited'),
  }),
  // Submitting puts the request in front of a reviewer, so a resource whose access has stopped
  // changing refuses it here rather than at review.
  submit: rule({
    requires: ['status', 'target.archived', 'target.deleted', 'target.kind'],
    check: (request) => targetRefusal(request)
      || statusRefusal([DRAFT], 'a draft can be submitted')(request),
  }),
  withdraw: rule({
    requires: ['status'],
    check: statusRefusal([DRAFT, UNDER_REVIEW], 'a draft or a request under review can be withdrawn'),
  }),

  review: rule({
    requires: ['status', 'target.archived', 'target.deleted', 'target.kind'],
    check: (request) => targetRefusal(request)
      || statusRefusal([UNDER_REVIEW], 'a request under review can be reviewed')(request),
  }),

  read: always,
});

module.exports = { accessRequestState };
