const { INVITATION_STATUS } = require('@prisma/client');

const StateContainer = require('../core/StateContainer');
const { rule, refuse } = require('../core/rules');

/**
 * What an invitation's state admits.
 *
 * An invitation is a standing offer of a membership row. It is answered once, and the group must
 * still be taking members, so both steps read the status and the group's archived state.
 *
 * The container is standalone: invitations have no policy container, because the authorization
 * layer decides an invitation through `group.invite` and a token. The startup check therefore does
 * not expect these action names among the policy actions.
 *
 * @see docs/design/groups/implementation/invitations.md
 */

const pendingAndOpen = (what) => rule({
  requires: ['status', 'group.is_archived'],
  check: (invitation) => {
    if (invitation.status !== INVITATION_STATUS.PENDING) {
      return refuse(`This invitation is ${invitation.status.toLowerCase()}, and only a pending `
        + `invitation can be ${what}.`, { state: invitation.status });
    }
    if (invitation.group.is_archived) {
      return refuse('The group is archived, so its invitations cannot be answered.', { state: 'archived' });
    }
    return null;
  },
});

const invitationState = new StateContainer({
  resourceType: 'invitation',
  standalone: true,
  description: "What an invitation's status and its group's archived state admit",
  examples: {
    // A pending invitation to an archived group, so the status admits both steps and the
    // group's state is what refuses them.
    archived: { status: INVITATION_STATUS.PENDING, group: { is_archived: true } },
  },
}).rules({
  accept: pendingAndOpen('accepted'),
  cancel: pendingAndOpen('withdrawn'),
});

module.exports = { invitationState };
