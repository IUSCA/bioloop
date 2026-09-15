/**
 * revokePreview.test.js
 *
 * `previewRevoke` reports, for a grant's type and each type it implies, the other grants that
 * still confer it. The case that matters is access another path supplies: a grant to a system
 * principal keeps a type a direct grant's revocation would otherwise take away.
 *
 * @see docs/design/groups/access-model-verification-plan.md — The UI layer
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { previewRevoke, COVERAGE_VIA } = require('@/services/grants/coverage');
const { AUTHENTICATED_USERS_GROUP_ID } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  createTestGrant,
  getAccessTypeId,
  deleteGrantsForResource,
  deleteDataset,
  deleteGroup,
  deleteUser,
} = require('../helpers');

let actor;
let viewer;
let group;
let dataset;
let download;
let viewMetadata;
let directDownload;
let principalView;

beforeAll(async () => {
  actor = await createTestUser('_rp_actor');
  viewer = await createTestUser('_rp_viewer');
  group = await createTestGroup(actor.subject_id, '_rp_group');
  dataset = await createTestDataset(group.id, '_rp');
  download = await getAccessTypeId('DATASET:DOWNLOAD');
  viewMetadata = await getAccessTypeId('DATASET:VIEW_METADATA');
  directDownload = await createTestGrant({
    subject_id: viewer.subject_id,
    resource_id: dataset.resource_id,
    access_type_id: download,
    granted_by: actor.subject_id,
  });
  principalView = await createTestGrant({
    subject_id: AUTHENTICATED_USERS_GROUP_ID,
    resource_id: dataset.resource_id,
    access_type_id: viewMetadata,
    granted_by: actor.subject_id,
  });
}, 30_000);

afterAll(async () => {
  await deleteGrantsForResource(dataset.resource_id).catch(() => {});
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(viewer.id);
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

test('revoking a direct grant keeps the types another path confers and drops the rest', async () => {
  const preview = await previewRevoke(directDownload.id);

  expect(preview[0]).toEqual({ access_type_id: download, still_conferred_by: [] });
  const view = preview.find((row) => row.access_type_id === viewMetadata);
  expect(view.still_conferred_by.map((row) => [row.id, row.via])).toEqual([[principalView.id, COVERAGE_VIA.PRINCIPAL]]);
  // Forced unless DOWNLOAD implies some type besides VIEW_METADATA, which nothing else confers.
  const lost = preview.filter((row) => ![download, viewMetadata].includes(row.access_type_id));
  expect(lost.length).toBeGreaterThan(0);
  lost.forEach((row) => expect(row.still_conferred_by).toEqual([]));
});

test('revoking a narrower grant under a wider one reports the wider one', async () => {
  const directView = await createTestGrant({
    subject_id: viewer.subject_id,
    resource_id: dataset.resource_id,
    access_type_id: viewMetadata,
    granted_by: actor.subject_id,
  });
  const preview = await previewRevoke(directView.id);

  expect(preview).toHaveLength(1);
  expect(preview[0].still_conferred_by.map((row) => row.id).sort())
    .toEqual([directDownload.id, principalView.id].sort());
});

test('an id that names no grant has no preview', async () => {
  expect(await previewRevoke('00000000-0000-4000-8000-00000000abcd')).toBeNull();
});
