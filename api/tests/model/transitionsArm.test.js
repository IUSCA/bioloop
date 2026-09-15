/**
 * transitionsArm.test.js
 *
 * The Transitions arm: the capability map offers an action on an access request only in the
 * states its transition row lists.
 *
 * The gate does not read state. A service refuses a wrong-state action with a 409, which is
 * the refusal shape for a state guard. So the capability is what must consult the table: a
 * page that offered `review` on an approved request would lead the reviewer into a 409.
 *
 * For every request status and three callers (the requester, the owning group's admin, and a
 * platform admin), each capability must equal "the gate allows it, and the request is in one
 * of the action's from-states". Actions with no transition row must equal the gate.
 *
 * @see docs/design/groups/access-model.md — The transition table
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { ACCESS_REQUEST_STATUS } = require('@prisma/client');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { authorizeAction, policyRegistry } = require('@/authorization');
const {
  createTestUser, createTestGroup, createTestDataset, deleteUser, deleteGroup, deleteDataset,
} = require('../services/helpers');

const container = policyRegistry.get('access_request');
const freshContext = () => ({ cache: { user: new Map(), resource: new Map(), context: new Map() } });

let actor;
let admin;
let requester;
let platformAdmin;
let group;
let dataset;
const requests = new Map();

beforeAll(async () => {
  actor = await createTestUser('_ta_actor');
  admin = await createTestUser('_ta_admin');
  requester = await createTestUser('_ta_requester');
  platformAdmin = await createTestUser('_ta_platform');
  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: platformAdmin.id, role_id: adminRole.id } });

  group = await createTestGroup(actor.subject_id, '_ta_group');
  await groupsService.addGroupMembers(group.id, { user_ids: [admin.subject_id], actor_id: actor.subject_id });
  await groupsService.promoteGroupMemberToAdmin(group.id, { user_id: admin.subject_id, actor_id: actor.subject_id });
  dataset = await createTestDataset(group.id, '_ta_dataset');

  for (const status of Object.values(ACCESS_REQUEST_STATUS)) {
    const row = await prisma.access_request.create({
      data: {
        type: 'NEW',
        resource_id: dataset.resource_id,
        requester_id: requester.subject_id,
        subject_id: requester.subject_id,
        status,
      },
    });
    requests.set(status, row);
  }
}, 60_000);

afterAll(async () => {
  await prisma.access_request.deleteMany({ where: { id: { in: [...requests.values()].map((r) => r.id) } } });
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await prisma.user_role.deleteMany({ where: { user_id: platformAdmin.id } });
  for (const u of [actor, admin, requester, platformAdmin]) await deleteUser(u.id);
  await prisma.$disconnect();
}, 60_000);

const callers = () => [['requester', requester], ['group admin', admin], ['platform admin', platformAdmin]];

describe.each(Object.values(ACCESS_REQUEST_STATUS))('a request in %s', (status) => {
  test.each(['requester', 'group admin', 'platform admin'])('offers %s only what the table allows', async (label) => {
    const [, caller] = callers().find(([l]) => l === label);
    const request = requests.get(status);
    const identifiers = { user: caller.subject_id, resource: request.id };
    const { capabilities } = await authorizeAction('access_request', 'read', {
      identifiers, policyExecutionContext: freshContext(), shouldDeriveCapabilities: true,
    });

    const wrong = [];
    for (const action of container.getActionNames()) {
      const gate = await authorizeAction('access_request', action, {
        identifiers, policyExecutionContext: freshContext(),
      });
      const transition = container.getTransition(action);
      const expected = gate.granted === true && (!transition || transition.from.includes(status));
      if (capabilities[action] !== expected) {
        wrong.push(`${action}: offered ${capabilities[action]}, table says ${expected}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
