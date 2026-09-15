/**
 * dataset.upload-status-filter.test.js
 *
 * The `upload_status` filter on GET /v2/datasets, and the grouping behind it.
 *
 * Two things are worth pinning. Every upload status must belong to exactly one group, so a
 * status added to the enum cannot ship unclassified. And a tombstoned upload — renamed and
 * marked deleted after it failed for good — must still be reachable, because otherwise the
 * person who uploaded never learns what happened.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — C5
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { searchAllDatasets } = require('@/services/datasets_v2');
const {
  UPLOAD_STATUSES, UPLOAD_STATUS_GROUPS, UPLOAD_STATUS_FILTERS, UNASSIGNED_DATASETS_GROUP_ID,
} = require('@/constants');

const suffix = `_usf_${Date.now()}`;
const created = [];

async function createUploadedDataset({ name, status, is_deleted }) {
  const dataset = await prisma.dataset.create({
    data: {
      name,
      type: 'RAW_DATA',
      is_deleted,
      owner_group: { connect: { id: UNASSIGNED_DATASETS_GROUP_ID } },
      resource: { create: { type: 'DATASET' } },
      upload_logs: { create: { status } },
    },
    select: { id: true, resource_id: true },
  });
  created.push(dataset);
  return dataset;
}

let inFlight;
let tombstoned;
let done;

beforeAll(async () => {
  inFlight = await createUploadedDataset({
    name: `uploading${suffix}`, status: UPLOAD_STATUSES.UPLOADING, is_deleted: false,
  });
  tombstoned = await createUploadedDataset({
    name: `failed${suffix}`, status: UPLOAD_STATUSES.PERMANENTLY_FAILED, is_deleted: true,
  });
  done = await createUploadedDataset({
    name: `complete${suffix}`, status: UPLOAD_STATUSES.COMPLETE, is_deleted: false,
  });
});

afterAll(async () => {
  const ids = created.map((d) => d.id);
  const resource_ids = created.map((d) => d.resource_id);
  await prisma.grant.deleteMany({ where: { resource_id: { in: resource_ids } } });
  await prisma.dataset.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

// The service is what the route calls; searching by name keeps the assertions to this
// test's own rows.
const search = (filters) => searchAllDatasets({
  filters: { name: suffix, ...filters },
  pagination: { limit: 100, offset: 0 },
  sort: { sort_by: 'updated_at', sort_order: 'desc' },
  includes: {},
});

describe('upload status grouping', () => {
  test('classifies every upload status exactly once', () => {
    const grouped = Object.values(UPLOAD_STATUS_GROUPS).flat();
    const all = Object.values(UPLOAD_STATUSES);

    expect([...grouped].sort()).toEqual([...all].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  test('accepts the group names, ANY, and every single status', () => {
    expect(UPLOAD_STATUS_FILTERS).toContain('ANY');
    Object.keys(UPLOAD_STATUS_GROUPS).forEach((g) => expect(UPLOAD_STATUS_FILTERS).toContain(g));
    Object.values(UPLOAD_STATUSES).forEach((s) => expect(UPLOAD_STATUS_FILTERS).toContain(s));
  });
});

describe('filtering a dataset listing by upload state', () => {
  test('ANY returns every uploaded dataset, tombstones included', async () => {
    const { data } = await search({ upload_status: 'ANY' });
    const ids = data.map((d) => d.id);

    expect(ids).toEqual(expect.arrayContaining([inFlight.id, tombstoned.id, done.id]));
  });

  test('FAILED reaches a tombstoned upload the default listing hides', async () => {
    const { data } = await search({ upload_status: 'FAILED' });

    expect(data.map((d) => d.id)).toEqual([tombstoned.id]);
  });

  test('the default listing hides that same row', async () => {
    const { data } = await search({ is_deleted: false });

    expect(data.map((d) => d.id)).not.toContain(tombstoned.id);
  });

  test('IN_PROGRESS and COMPLETE each return their own rows', async () => {
    const inProgress = await search({ upload_status: 'IN_PROGRESS' });
    const complete = await search({ upload_status: 'COMPLETE' });

    expect(inProgress.data.map((d) => d.id)).toEqual([inFlight.id]);
    expect(complete.data.map((d) => d.id)).toEqual([done.id]);
  });

  test('a single status is accepted as well as a group name', async () => {
    const { data } = await search({ upload_status: UPLOAD_STATUSES.UPLOADING });

    expect(data.map((d) => d.id)).toEqual([inFlight.id]);
  });
});
