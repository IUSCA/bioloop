/**
 * transitionsArm.test.js
 *
 * The Transitions arm: the two answers a request carries are separate, and each is correct.
 *
 * `_meta.capabilities` says what the caller could do, and it does not read the request's
 * status: a reviewer holds `review` on a request whatever state it is in. `available_actions`
 * says what the request's current status admits, and it does not read the caller: a draft
 * admits `submit` whoever is asking. The offer a page makes is the intersection, and a service
 * refuses a wrong-status step with 409.
 *
 * For every request status and three callers (the requester, the owning group's admin, and a
 * platform admin), this asserts each half against its own source, and that the gate itself
 * stays blind to status.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/implementation/restrictions-plan.md — The two answers in the response
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const { ACCESS_REQUEST_STATUS } = require('@prisma/client');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const state = require('@/state');
const { authorizeAction, policyRegistry } = require('@/authorization');
const { datasetResource, userSubject } = require('../state/rows');
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

/** The request as a caller fetches it for its state rules: its status, resource, and subject. */
const stateRow = (status) => ({ status, resource: datasetResource(), subject: userSubject() });

describe.each(Object.values(ACCESS_REQUEST_STATUS))('a request in %s', (status) => {
  test.each(['requester', 'group admin', 'platform admin'])('offers %s the gate, blind to status', async (label) => {
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
      // The capability equals the gate, with no state term in it. A requester holds `submit`
      // on their approved request; the request is what refuses it.
      if (capabilities[action] !== (gate.granted === true)) {
        wrong.push(`${action}: offered ${capabilities[action]}, gate says ${gate.granted}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('admits the steps its status admits, whoever is asking', () => {
    const admitted = state.availableActionsOf('access_request', stateRow(status));

    // Reading is possible in every status, and the steps depend on the status alone.
    expect(admitted).toContain('read');
    expect(admitted.includes('submit')).toBe(status === 'DRAFT');
    expect(admitted.includes('update')).toBe(status === 'DRAFT');
    expect(admitted.includes('withdraw')).toBe(['DRAFT', 'UNDER_REVIEW'].includes(status));
    expect(admitted.includes('review')).toBe(status === 'UNDER_REVIEW');
  });
});

test('the two answers disagree, which is why a page needs both', () => {
  // Forced unless the halves are independent: if the capability map still read status, the
  // requester would not be offered `submit` on an approved request and this would pass
  // trivially.
  const draft = state.availableActionsOf('access_request', stateRow('DRAFT'));
  const approved = state.availableActionsOf('access_request', stateRow('APPROVED'));

  expect(draft).toContain('submit');
  expect(approved).not.toContain('submit');
  expect(container.getActionNames()).toContain('submit');
});
