/**
 * invitation.concurrency.test.js
 *
 * The two races an invitation can lose: two admins inviting the same person at the same
 * moment, and an admin withdrawing an invitation while the invited person's account is being
 * created.
 *
 * Each test asserts an invariant over every iteration rather than a particular winner. Which
 * side wins is the database's business; what must never happen is one invitation producing
 * two rows, or a withdrawn invitation producing a membership. The deterministic version of
 * the second guard, with the ordering forced rather than raced, is
 * `invitation.service.test.js` — "a withdrawal that lands first is not overwritten".
 *
 * @see docs/design/groups/invitations.md — Stale invitations and failures
 */

const path = require('path');
const { INVITATION_STATUS } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const invitationService = require('@/services/invitations');
const { runRace, fanOut, RACE_TIMEOUT_MS } = require('../concurrency-utils');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup, activeMembership,
} = require('../helpers');

// Every test here drives runRace, which is far slower than Jest's 5s default.
jest.setTimeout(RACE_TIMEOUT_MS);

let admin;
let dana;

const usersToDelete = [];

beforeAll(async () => {
  admin = await createTestUser('_inv_race_admin');
  dana = await createTestUser('_inv_race_dana');
  usersToDelete.push(admin.id, dana.id);
}, 30_000);

afterAll(async () => {
  await prisma.group_invitation.deleteMany({ where: { invited_by: admin.subject_id } });
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

/** A group nothing else in this suite touches, deleted by the iteration's cleanup. */
async function freshGroup(i) {
  return createTestGroup(admin.subject_id, `_inv_race_${Date.now()}_${i}`);
}

async function dropGroup(group) {
  await prisma.group_invitation.deleteMany({ where: { group_id: group.id } });
  await deleteGroup(group.id).catch(() => {});
}

test('two admins inviting the same person produce one invitation', () => runRace(
  async (i) => ({ group: await freshGroup(i) }),
  ({ group }) => fanOut(3, () => invitationService.createInvitation({
    group_id: group.id, email: 'dana@university.edu', invited_by: admin.subject_id,
  })),
  async (results, { group }) => {
    // Nobody is told to try again. The group row is locked for the whole transaction, so the
    // admins who arrive second read the first one's invitation instead of colliding with it.
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);

    const statuses = results.map((r) => r.value.status).sort();
    expect(statuses).toEqual(['already_invited', 'already_invited', 'invited']);

    const rows = await prisma.group_invitation.findMany({ where: { group_id: group.id } });
    expect(rows).toHaveLength(1);
    // All three callers were handed the row that exists, not a stale or absent one.
    const ids = new Set(results.map((r) => r.value.invitation.id));
    expect([...ids]).toEqual([rows[0].id]);
  },
  ({ group }) => dropGroup(group),
));

test('a withdrawal racing a signup never leaves a cancelled invitation with a membership', () => runRace(
  async (i) => {
    const group = await freshGroup(i);
    const { invitation } = await invitationService.createInvitation({
      group_id: group.id, email: dana.email, invited_by: admin.subject_id,
    });
    return { group, invitation };
  },
  ({ group, invitation }) => [
    invitationService.cancelInvitation({ group_id: group.id, invitation_id: invitation.id }),
    prisma.$transaction((tx) => invitationService.applyPendingInvitations({
      email: dana.email, user_subject_id: dana.subject_id, tx,
    })),
  ],
  async (results, { group, invitation }) => {
    const row = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    const membership = await activeMembership(group.id, dana.subject_id);

    if (row.status === INVITATION_STATUS.CANCELLED) {
      // The admin's decision stands. Whichever way the race went, a withdrawn invitation
      // cannot have put anybody in the group.
      expect(membership).toBeNull();
      expect(row.cancellation_reason).toBe('admin_cancelled');
    } else {
      expect(row.status).toBe(INVITATION_STATUS.ACCEPTED);
      expect(membership).not.toBeNull();
      // The losing cancel is refused rather than silently rewriting an accepted invitation.
      const [cancelResult] = results;
      expect(cancelResult.status).toBe('rejected');
      expect(cancelResult.reason.status).toBe(409);
    }
  },
  async ({ group }) => {
    await prisma.group_user.deleteMany({ where: { group_id: group.id, user_id: dana.subject_id } });
    await dropGroup(group);
  },
));
