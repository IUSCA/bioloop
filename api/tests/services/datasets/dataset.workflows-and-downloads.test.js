/**
 * dataset.workflows-and-downloads.test.js
 *
 * The v2 read path for runs and downloads. Every case here is a bug that shipped because
 * nothing called the code: the download services queried an integer primary key with a
 * resource UUID, the run route called a service function that did not exist, and the
 * workflows sub-router did not merge `:dataset_id` from its parent.
 *
 * @see .todo/issues/06-dataset-actions-workflows.md — Phase 1
 */

const path = require('path');
const { randomUUID } = require('crypto');
const { RESOURCE_TYPE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const wfService = require('@/services/workflow');
const workflowService = require('@/services/datasets_v2/workflows');
const datasetFileService = require('@/services/datasets_v2/files');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let group;
let dataset;

const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_wfd_actor');
  usersToDelete.push(actor.id);
  group = await createTestGroup(actor.subject_id, '_wfd_group');
  groupsToDelete.push(group.id);
  dataset = await createTestDataset(group.id, '_wfd_ds');
  datasetsToDelete.push(dataset.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) {
    const d = await prisma.dataset.findUnique({ where: { id }, select: { resource_id: true } });
    if (d) await prisma.grant.deleteMany({ where: { resource_id: d.resource_id } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('listing a dataset\'s runs', () => {
  test('an unknown dataset is distinguishable from one with no runs', async () => {
    // null and [] mean different things: the route turns the first into a 404 and the
    // second into an empty list.
    expect(await workflowService.listDatasetWorkflows(randomUUID())).toBeNull();
    expect(await workflowService.listDatasetWorkflows(dataset.resource_id)).toEqual([]);
  });

  test('addresses the dataset by resource id, not by its integer key', async () => {
    // The whole class of bug this file exists for. Passing the integer must not resolve.
    expect(await workflowService.listDatasetWorkflows(String(dataset.id))).toBeNull();
  });

  test('merges what Postgres holds with what the workflow service holds', async () => {
    const wf_id = randomUUID();
    await prisma.workflow.create({
      data: { id: wf_id, dataset_id: dataset.id, initiator_id: actor.id },
    });

    jest.spyOn(wfService, 'getAll').mockResolvedValue({
      data: { results: [{ id: wf_id, name: 'stage', status: 'SUCCESS' }] },
    });

    const runs = await workflowService.listDatasetWorkflows(dataset.resource_id);

    expect(runs).toHaveLength(1);
    // name and status come from the workflow service, initiator from Postgres.
    expect(runs[0]).toMatchObject({ id: wf_id, name: 'stage', status: 'SUCCESS' });
    expect(runs[0].initiator).toMatchObject({ id: actor.id });

    await prisma.workflow.deleteMany({ where: { id: wf_id } });
  });

  test('an unreachable workflow service yields no runs rather than an error', async () => {
    const wf_id = randomUUID();
    await prisma.workflow.create({ data: { id: wf_id, dataset_id: dataset.id } });

    jest.spyOn(wfService, 'getAll').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(workflowService.listDatasetWorkflows(dataset.resource_id)).resolves.toEqual([]);

    await prisma.workflow.deleteMany({ where: { id: wf_id } });
  });

  test('no runs means the workflow service is never called', async () => {
    const getAll = jest.spyOn(wfService, 'getAll');
    await workflowService.listDatasetWorkflows(dataset.resource_id);
    expect(getAll).not.toHaveBeenCalled();
  });
});

describe('finding one run of a dataset', () => {
  let otherDataset;
  let wf_id;

  beforeAll(async () => {
    otherDataset = await createTestDataset(group.id, '_wfd_other');
    datasetsToDelete.push(otherDataset.id);
    wf_id = randomUUID();
    await prisma.workflow.create({ data: { id: wf_id, dataset_id: dataset.id } });
  });

  afterAll(async () => {
    await prisma.workflow.deleteMany({ where: { id: wf_id } });
  });

  test('returns the run when it belongs to the dataset', async () => {
    jest.spyOn(wfService, 'getAll').mockResolvedValue({
      data: { results: [{ id: wf_id, name: 'stage', status: 'FAILURE' }] },
    });

    const run = await workflowService.findDatasetRun(dataset.resource_id, wf_id);
    expect(run).toMatchObject({ id: wf_id, name: 'stage', status: 'FAILURE' });
  });

  test('refuses a run reached through a different dataset', async () => {
    // The legacy routes authorize on the workflow alone and never mention the dataset, so
    // holding rights on one dataset lets you act on any run. This is that hole closed: the
    // run exists and the caller may well be an admin of otherDataset, and it is still null.
    const getAll = jest.spyOn(wfService, 'getAll');

    await expect(
      workflowService.findDatasetRun(otherDataset.resource_id, wf_id),
    ).resolves.toBeNull();

    // Refused before the workflow service is consulted at all.
    expect(getAll).not.toHaveBeenCalled();
  });

  test('an unknown run and an unknown dataset are both null', async () => {
    expect(await workflowService.findDatasetRun(dataset.resource_id, randomUUID())).toBeNull();
    expect(await workflowService.findDatasetRun(randomUUID(), wf_id)).toBeNull();
  });

  test('a run the workflow service cannot describe is null, not a half-built object', async () => {
    jest.spyOn(wfService, 'getAll').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      workflowService.findDatasetRun(dataset.resource_id, wf_id),
    ).resolves.toBeNull();
  });
});

describe('download info resolves the dataset by resource id', () => {
  test('the bundle route reaches the dataset and stops at "not staged"', async () => {
    // Reaching this message proves the resource UUID resolved to the integer row: the
    // stage_alias check runs after the lookup. Before the fix this threw a Prisma
    // validation error instead.
    await expect(
      datasetFileService.getBundleDownloadInfo({
        dataset_id: dataset.resource_id,
        actor_id: actor.id,
      }),
    ).rejects.toThrow(/not prepared for download/i);
  });

  test('a per-file download resolves both the dataset and its file', async () => {
    // dataset_file.dataset_id is the integer key too, so this covers the second lookup.
    const file = await prisma.dataset_file.create({
      data: { name: 'reads.fastq', path: 'reads.fastq', dataset_id: dataset.id },
    });

    await expect(
      datasetFileService.getFileDownloadInfo({
        dataset_id: dataset.resource_id,
        file_id: file.id,
        actor_id: actor.id,
      }),
    ).rejects.toThrow(/not prepared for download/i);

    await prisma.dataset_file.deleteMany({ where: { id: file.id } });
  });

  test('an unknown dataset is a 404, not a database error', async () => {
    await expect(
      datasetFileService.getBundleDownloadInfo({
        dataset_id: randomUUID(),
        actor_id: actor.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test('the integer key is not accepted where a resource id belongs', async () => {
    await expect(
      datasetFileService.getBundleDownloadInfo({
        dataset_id: String(dataset.id),
        actor_id: actor.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('the file tree resolves the dataset by resource id', () => {
  // `/files/tree` returned 500 to every caller who passed the policy: getFileTree put the
  // route's resource UUID straight into dataset_file.dataset_id, which is the integer
  // dataset.id. Prisma rejected it with "Expected IntFilter or Int, provided String".
  let filesDataset;

  beforeAll(async () => {
    filesDataset = await createTestDataset(group.id, '_wfd_tree');
    datasetsToDelete.push(filesDataset.id);
    await prisma.dataset_file.createMany({
      data: [
        { dataset_id: filesDataset.id, name: 'reads', path: 'reads', filetype: 'directory' },
        {
          dataset_id: filesDataset.id,
          name: 'a.fastq',
          path: 'reads/a.fastq',
          filetype: 'file',
          size: BigInt(12),
        },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.dataset_file.deleteMany({ where: { dataset_id: filesDataset.id } });
  }, 30_000);

  test('builds the tree for a dataset addressed by its resource id', async () => {
    const tree = await datasetFileService.getFileTree({
      dataset_id: filesDataset.resource_id,
    });
    expect(Object.keys(tree.children)).toContain('reads');
    expect(Object.keys(tree.children.reads.children)).toContain('a.fastq');
  });

  test('the integer key is not accepted where a resource id belongs', async () => {
    await expect(
      datasetFileService.getFileTree({ dataset_id: String(filesDataset.id) }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test('an unknown dataset is a 404, not a database error', async () => {
    await expect(
      datasetFileService.getFileTree({ dataset_id: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test('a dataset with no files has an empty tree rather than an error', async () => {
    const tree = await datasetFileService.getFileTree({ dataset_id: dataset.resource_id });
    expect(tree.children).toEqual({});
  });
});

describe('listing files tells an empty dataset from an unknown one', () => {
  // listFiles used findFirstOrThrow, so a dataset holding no file rows answered 404 — the
  // same status as a dataset that does not exist, and to a platform admin as readily as to
  // anyone. An empty dataset is a normal state.
  let listDataset;

  beforeAll(async () => {
    listDataset = await createTestDataset(group.id, '_wfd_ls');
    datasetsToDelete.push(listDataset.id);
    await prisma.dataset_file.create({
      data: {
        dataset_id: listDataset.id, name: 'top', path: 'top', filetype: 'directory',
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.dataset_file.deleteMany({ where: { dataset_id: listDataset.id } });
  }, 30_000);

  test('a dataset with no files is an empty listing, not a 404', async () => {
    await expect(
      datasetFileService.listFiles({ dataset_id: dataset.resource_id }),
    ).resolves.toEqual([]);
  });

  test('an unknown dataset is still a 404', async () => {
    await expect(
      datasetFileService.listFiles({ dataset_id: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test('a base path with nothing under it is an empty listing', async () => {
    await expect(
      datasetFileService.listFiles({ dataset_id: listDataset.resource_id, base: 'nowhere' }),
    ).resolves.toEqual([]);
  });

  test('the integer key is not accepted where a resource id belongs', async () => {
    await expect(
      datasetFileService.listFiles({ dataset_id: String(listDataset.id) }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('the resource row a dataset carries', () => {
  test('is what every v2 entry point addresses it by', async () => {
    const resource = await prisma.resource.findUnique({
      where: { id: dataset.resource_id },
    });
    expect(resource).not.toBeNull();
    expect(resource.type).toBe(RESOURCE_TYPE.DATASET);
  });
});
