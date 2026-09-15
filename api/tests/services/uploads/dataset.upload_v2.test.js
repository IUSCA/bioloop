/**
 * dataset.upload_v2.test.js
 *
 * Registering an upload writes the dataset, its deterministic origin_path, and its upload
 * log in one transaction, so there is never a dataset whose upload nobody is tracking.
 *
 * Everything downstream of registration keys on dataset_upload_log.dataset_id and
 * dataset.origin_path, never on which service wrote the row, which is why the TUS server and
 * the completion routes are reused unchanged.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — C1
 */

const path = require('path');
const config = require('config');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { registerUpload, getUploadLog, buildUploadOriginPath } = require('@/services/datasets_v2/uploads');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup,
} = require('../helpers');

let uploader;
let group;
let otherGroup;

const usersToDelete = [];
const groupsToDelete = [];
const datasetsToDelete = [];

const user = () => ({ ...uploader, roles: ['user'] });

beforeAll(async () => {
  uploader = await createTestUser('_upl_user');
  usersToDelete.push(uploader.id);
  group = await createTestGroup(uploader.subject_id, '_upl_group');
  otherGroup = await createTestGroup(uploader.subject_id, '_upl_other');
  groupsToDelete.push(group.id, otherGroup.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) {
    const d = await prisma.dataset.findUnique({ where: { id }, select: { resource_id: true } });
    if (d) await prisma.grant.deleteMany({ where: { resource_id: d.resource_id } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('registerUpload', () => {
  test('creates the dataset, its origin_path, and its upload log together', async () => {
    const log = await registerUpload({
      user: user(),
      data: { name: `upload-one-${Date.now()}`, type: 'RAW_DATA', owner_group_id: group.id },
    });
    datasetsToDelete.push(log.dataset.id);

    expect(log.status).toBe('UPLOADING');
    expect(log.dataset.create_method).toBe('UPLOAD');
    expect(log.dataset.origin_path).toBe(buildUploadOriginPath(log.dataset));
  });

  test('the origin_path is keyed by dataset id, so two groups do not collide', async () => {
    // The upload directory was already id-keyed before groups existed. This pins that,
    // because it is the reason upload needed no path changes when names became per-group.
    const name = `upload-shared-${Date.now()}`;
    const first = await registerUpload({
      user: user(), data: { name, type: 'RAW_DATA', owner_group_id: group.id },
    });
    const second = await registerUpload({
      user: user(), data: { name, type: 'RAW_DATA', owner_group_id: otherGroup.id },
    });
    datasetsToDelete.push(first.dataset.id, second.dataset.id);

    expect(first.dataset.name).toBe(second.dataset.name);
    expect(first.dataset.origin_path).not.toBe(second.dataset.origin_path);
    expect(first.dataset.origin_path).toContain(`/${first.dataset.id}/`);
  });

  test('the origin_path is built on the directory the workers see', async () => {
    const base = config.get('upload.host_dir') || config.get('upload.api_dir');
    const log = await registerUpload({
      user: user(),
      data: { name: `upload-base-${Date.now()}`, type: 'DATA_PRODUCT', owner_group_id: group.id },
    });
    datasetsToDelete.push(log.dataset.id);

    expect(log.dataset.origin_path.startsWith(base)).toBe(true);
    expect(log.dataset.origin_path).toContain('/data_products/');
  });

  test('answers null when the group already holds the name', async () => {
    const name = `upload-dup-${Date.now()}`;
    const first = await registerUpload({
      user: user(), data: { name, type: 'RAW_DATA', owner_group_id: group.id },
    });
    datasetsToDelete.push(first.dataset.id);

    const second = await registerUpload({
      user: user(), data: { name, type: 'RAW_DATA', owner_group_id: group.id },
    });

    expect(second).toBeNull();
  });

  test('leaves no dataset behind when the name is taken', async () => {
    // The whole registration is one transaction. A refused second attempt must not leave a
    // dataset with no upload log, which nothing downstream would ever pick up.
    const name = `upload-atomic-${Date.now()}`;
    const first = await registerUpload({
      user: user(), data: { name, type: 'RAW_DATA', owner_group_id: group.id },
    });
    datasetsToDelete.push(first.dataset.id);
    await registerUpload({
      user: user(), data: { name, type: 'RAW_DATA', owner_group_id: group.id },
    });

    const matching = await prisma.dataset.count({
      where: {
        name, type: 'RAW_DATA', owner_group_id: group.id, is_deleted: false,
      },
    });
    expect(matching).toBe(1);
  });
});

describe('getUploadLog', () => {
  test('finds the log by dataset id', async () => {
    const log = await registerUpload({
      user: user(),
      data: { name: `upload-read-${Date.now()}`, type: 'RAW_DATA', owner_group_id: group.id },
    });
    datasetsToDelete.push(log.dataset.id);

    const found = await getUploadLog(log.dataset.id);

    expect(found.id).toBe(log.id);
    expect(found.dataset.id).toBe(log.dataset.id);
  });

  test('answers nothing for a dataset that was not uploaded', async () => {
    expect(await getUploadLog(-1)).toBeNull();
  });
});
