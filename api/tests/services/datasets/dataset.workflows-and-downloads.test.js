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

describe('the resource row a dataset carries', () => {
  test('is what every v2 entry point addresses it by', async () => {
    const resource = await prisma.resource.findUnique({
      where: { id: dataset.resource_id },
    });
    expect(resource).not.toBeNull();
    expect(resource.type).toBe(RESOURCE_TYPE.DATASET);
  });
});
