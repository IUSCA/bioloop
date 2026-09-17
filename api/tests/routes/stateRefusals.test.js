/**
 * stateRefusals.test.js
 *
 * Through the routes: an archived resource answers 409, and the response says what the state
 * admits.
 *
 * The two answers are separate, and this is where that becomes visible to a caller. The group's
 * admin still holds `edit_metadata`, so `_meta.capabilities` carries it; the group's state does
 * not admit it, so `_meta.available_actions` leaves it out and the write is refused with 409
 * rather than 403. A 403 would tell the admin they lack authority, which is false.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/access-model.md — The UI consumption contract
 */

const path = require('path');

const express = require('express');
// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { errorHandler } = require('@/middleware/error');
const groupRoutes = require('@/routes/groups');
const collectionRoutes = require('@/routes/collections');
const datasetRoutes = require('@/routes/datasets_v2');
const stateRoutes = require('@/routes/states');
const grantRoutes = require('@/routes/grants');
const groupsService = require('@/services/groups');
const invitationService = require('@/services/invitations');
const {
  createTestUser, createTestGroup, createTestDataset, createTestCollection,
  createTestGrant, getAccessTypeId, deleteGrants,
  deleteCollection, deleteDataset, deleteGroup, deleteUser,
} = require('../services/helpers');

// The routes read `req.user` and nothing else off the request, so authentication is a switch
// the tests set. Mounting the whole app would start the TUS server for no gain.
let currentUser = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = currentUser; next(); });
app.use('/groups', groupRoutes);
app.use('/collections', collectionRoutes);
app.use('/v2/datasets', datasetRoutes);
app.use('/v2/states', stateRoutes);
app.use('/grants', grantRoutes);
app.use(errorHandler);

let admin;
let group;
let dataset;
let collection;
let grant;
/** An active group, and access the archived group holds on a collection it owns. */
let otherGroup;
let otherCollection;
let heldByGroup;

beforeAll(async () => {
  admin = await createTestUser('_sr_admin');
  group = await createTestGroup(admin.subject_id, '_sr_group');
  await prisma.group_user.create({
    data: { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' },
  });
  dataset = await createTestDataset(group.id, '_sr_ds');
  collection = await createTestCollection(group.id, admin.subject_id, '_sr_coll');
  // A grant and an invitation to read the state answer off. Both are made while the group is
  // active, because an archived group takes no new invitation.
  grant = await createTestGrant({
    subject_id: admin.subject_id,
    resource_id: collection.id,
    access_type_id: await getAccessTypeId('COLLECTION:VIEW_METADATA'),
    granted_by: admin.subject_id,
  });
  otherGroup = await createTestGroup(admin.subject_id, '_sr_other');
  await prisma.group_user.create({
    data: { group_id: otherGroup.id, user_id: admin.subject_id, role: 'ADMIN' },
  });
  otherCollection = await createTestCollection(otherGroup.id, admin.subject_id, '_sr_other_coll');
  heldByGroup = await createTestGrant({
    subject_id: group.id,
    resource_id: otherCollection.id,
    access_type_id: await getAccessTypeId('COLLECTION:VIEW_METADATA'),
    granted_by: admin.subject_id,
  });
  await invitationService.createInvitation({
    group_id: group.id,
    email: '_sr_invitee@example.org',
    role: 'MEMBER',
    invited_by: admin.subject_id,
  });
  currentUser = admin;
}, 60_000);

afterAll(async () => {
  await prisma.group_invitation.deleteMany({ where: { group_id: group.id } }).catch(() => {});
  await deleteGrants([grant.id, heldByGroup.id]).catch(() => {});
  await deleteCollection(otherCollection.id).catch(() => {});
  await deleteGroup(otherGroup.id).catch(() => {});
  await deleteCollection(collection.id).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(admin.id).catch(() => {});
  await prisma.$disconnect();
}, 60_000);

describe('an active group', () => {
  test('reports the actions its state admits beside the ones the caller holds', async () => {
    const res = await request(app).get(`/groups/${group.id}`);

    expect(res.status).toBe(200);
    expect(res.body._meta.available_actions).toContain('edit_metadata');
    expect(res.body._meta.available_actions).toContain('archive');
    // The way out is not open while it is not archived.
    expect(res.body._meta.available_actions).not.toContain('unarchive');
  });

  test('a grant on what it owns admits revocation, and an invitation admits withdrawal', async () => {
    const grants = await request(app).get(`/grants/resource/COLLECTION/${collection.id}`);
    expect(grants.status).toBe(200);
    const rows = grants.body.flatMap((g) => g.grants);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r._meta.available_actions.includes('revoke'))).toBe(true);

    const invitations = await request(app).get(`/groups/${group.id}/invitations`);
    expect(invitations.status).toBe(200);
    expect(invitations.body.data.length).toBeGreaterThan(0);
    expect(invitations.body.data[0]._meta.available_actions).toContain('cancel');
    // The group's archived column is what the rule reads, and it stays out of the row.
    expect(invitations.body.data[0].group).toBeUndefined();
  });
});

describe('an archived group', () => {
  beforeAll(async () => {
    await groupsService.archiveGroup(group.id, admin.subject_id);
  }, 30_000);

  afterAll(async () => {
    await groupsService.unarchiveGroup(group.id, admin.subject_id);
  }, 30_000);

  test('keeps the capability and drops the action from what its state admits', async () => {
    const res = await request(app).get(`/groups/${group.id}`);

    expect(res.status).toBe(200);
    // The admin still holds it: archiving is not a loss of authority.
    expect(res.body._meta.capabilities).toContain('edit_metadata');
    // The state does not admit it, which is what the UI reads to put the button out of reach.
    expect(res.body._meta.available_actions).not.toContain('edit_metadata');
    expect(res.body._meta.available_actions).toContain('unarchive');
    // Reading goes on.
    expect(res.body._meta.available_actions).toContain('view_members');
  });

  test('refuses a change to its metadata with 409, not 403', async () => {
    const res = await request(app)
      .patch(`/groups/${group.id}`)
      .send({ version: 1, description: 'changed while archived' });

    expect(res.status).toBe(409);
  });

  test('refuses a new member with 409', async () => {
    const joiner = await createTestUser('_sr_joiner');
    try {
      const res = await request(app)
        .post(`/groups/${group.id}/members`)
        .send({ members: [{ user_id: joiner.subject_id }] });

      expect(res.status).toBe(409);
    } finally {
      await deleteUser(joiner.id).catch(() => {});
    }
  }, 30_000);

  test('the dataset it owns reports the same split', async () => {
    const res = await request(app).get(`/v2/datasets/${dataset.resource_id}`);

    expect(res.status).toBe(200);
    expect(res.body._meta.available_actions).not.toContain('edit_metadata');
    // Archiving closes governance and leaves the bytes readable.
    expect(res.body._meta.available_actions).toContain('download');
    expect(res.body._meta.available_actions).toContain('view_metadata');
  });

  test('the collection it owns reports the same split', async () => {
    const res = await request(app).get(`/collections/${collection.id}`);

    expect(res.status).toBe(200);
    expect(res.body._meta.available_actions).not.toContain('edit_metadata');
    expect(res.body._meta.available_actions).toContain('view_metadata');
  });

  test('the grants on what it owns withhold revocation, and the caller keeps the capability', async () => {
    // Grouped by subject, and read from `valid_grants`: archiving revokes nothing, so the row
    // is still here and only its state answer has changed.
    const grouped = await request(app).get(`/grants/resource/COLLECTION/${collection.id}`);
    expect(grouped.status).toBe(200);
    const rows = grouped.body.flatMap((g) => g.grants);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r._meta.available_actions.includes('revoke'))).toBe(true);

    // The same grant through the subject-on-resource list, which is the one the expanded
    // panel reads.
    const direct = await request(app).get(`/grants/USER/${admin.subject_id}/COLLECTION/${collection.id}`);
    expect(direct.status).toBe(200);
    expect(direct.body.length).toBeGreaterThan(0);
    expect(direct.body.every((r) => !r._meta.available_actions.includes('revoke'))).toBe(true);

    // Authority is untouched: the admin may still manage grants, and the refusal is the
    // resource's state rather than a missing capability.
    const onCollection = await request(app).get(`/collections/${collection.id}`);
    expect(onCollection.body._meta.capabilities).toContain('manage_grants');
  });

  test("access it holds on another group's collection can still be revoked", async () => {
    // The by-subject list reads the group's own state for the issue answer and the collection's
    // for revocation. The collection belongs to an active group, so revoking stays open.
    // @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 2
    const res = await request(app).get(`/grants/subject/GROUP/${group.id}`);
    expect(res.status).toBe(200);
    const rows = res.body.flatMap((r) => r.grants);
    expect(rows.map((r) => r.id)).toContain(heldByGroup.id);
    const held = rows.find((r) => r.id === heldByGroup.id);
    expect(held._meta.available_actions).toContain('revoke');
    expect(held._meta.available_actions).not.toContain('create');
  });

  test('its invitations withhold withdrawal', async () => {
    const res = await request(app).get(`/groups/${group.id}/invitations`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r) => !r._meta.available_actions.includes('cancel'))).toBe(true);
  });
});

describe('the states route', () => {
  test('says what archiving forbids for a resource type', async () => {
    const res = await request(app).get('/v2/states/group/archived/forbidden-actions');

    expect(res.status).toBe(200);
    expect(res.body.resource_type).toBe('group');
    const actions = res.body.forbidden_actions.map((f) => f.action);
    expect(actions).toContain('add_member');
    expect(actions).toContain('edit_metadata');
    expect(actions).not.toContain('view_members');
    // Each answer carries the message a service would return, so a dialog and a 409 agree.
    expect(res.body.forbidden_actions.every((f) => typeof f.message === 'string')).toBe(true);
  });

  test('a resource type with no such state is a gap, not an empty list', async () => {
    expect((await request(app).get('/v2/states/user/archived/forbidden-actions')).status).toBe(404);
    expect((await request(app).get('/v2/states/nonesuch/archived/forbidden-actions')).status).toBe(404);
  });
});
