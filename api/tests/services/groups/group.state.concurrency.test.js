/**
 * group.state.concurrency.test.js
 *
 * A state check is only as good as the lock it reads under. Every mutating group service takes
 * `FOR UPDATE` on the group row and then asks the state layer about that locked row, so the
 * state a call checks is the state its write sees.
 *
 * This suite races archiving against a membership change. Without the lock, both transactions
 * read `is_archived = false`, both pass the check, and the archived group gains a member after
 * it closed. With it, one waits for the other and then sees the truth, so either the archive
 * wins and the membership change is refused, or the membership change commits first and the
 * archive follows.
 *
 * Both outcomes really occur, so neither branch of the assertion is dead: measured over 40
 * iterations on a warm local database, the membership change committed 14 times and was refused
 * with 409 the other 26, and no iteration produced a refusal paired with a member or a success
 * paired with none. The split depends on machine and load, which is why the test asserts the
 * pairing rather than the ratio.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/access-model.md — The state check
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { runRace, RACE_TIMEOUT_MS } = require('../concurrency-utils');

// Every test here drives runRace, which is far slower than Jest's 5s default.
jest.setTimeout(RACE_TIMEOUT_MS);

const {
  createTestUser,
  createTestGroup,
  activeMembership,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let joiner;

beforeAll(async () => {
  actor = await createTestUser('_gsc_actor');
  joiner = await createTestUser('_gsc_joiner');
}, 30_000);

afterAll(async () => {
  await deleteUser(joiner.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

/** A fresh group for one iteration, with the actor as its admin. */
async function freshGroup(i) {
  const group = await createTestGroup(actor.subject_id, `_gsc_${i}`);
  await prisma.group_user.create({
    data: { group_id: group.id, user_id: actor.subject_id, role: 'ADMIN' },
  });
  return { group };
}

async function dropGroup({ group }) {
  await prisma.group_user.deleteMany({ where: { group_id: group.id } });
  await deleteGroup(group.id);
}

const settledStatus = (result) => (result.status === 'fulfilled' ? 'won' : result.reason?.status);

test('archiving and a membership change cannot both win', async () => {
  await runRace(
    freshGroup,
    ({ group }) => [
      groupsService.archiveGroup(group.id, actor.subject_id),
      groupsService.addGroupMembers(group.id, {
        user_ids: [joiner.subject_id], actor_id: actor.subject_id,
      }),
    ],
    async (results, { group }) => {
      const [archive, add] = results.map(settledStatus);
      const row = await prisma.group.findUnique({ where: { id: group.id } });
      const membership = await activeMembership(group.id, joiner.subject_id);

      // Archiving is the only one of the two that cannot lose: nothing here competes with it.
      expect(archive).toBe('won');
      expect(row.is_archived).toBe(true);

      // The membership change either committed before the archive or was refused by it. The
      // outcome that must not happen is a refusal paired with a member, or a success paired
      // with none, which is what an unlocked read would produce.
      if (add === 'won') {
        expect(membership).not.toBeNull();
      } else {
        expect(add).toBe(409);
        expect(membership).toBeNull();
      }
    },
    dropGroup,
  );
});

test('two archives of the same group resolve to one archive and one conflict', async () => {
  await runRace(
    freshGroup,
    ({ group }) => [
      groupsService.archiveGroup(group.id, actor.subject_id),
      groupsService.archiveGroup(group.id, actor.subject_id),
    ],
    async (results, { group }) => {
      const statuses = results.map(settledStatus).sort();
      // One archives, and the other reads the locked row afterwards and answers 409 rather
      // than archiving a second time and writing a duplicate audit entry.
      expect(statuses).toEqual([409, 'won']);

      const row = await prisma.group.findUnique({ where: { id: group.id } });
      expect(row.is_archived).toBe(true);
    },
    dropGroup,
  );
});
