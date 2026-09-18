/**
 * dataset.import.test.js
 *
 * Import registers a directory that already exists. Three things have to hold and each is
 * checked in the service rather than trusted from the client: the path is inside a source
 * the caller may browse, the source is ACTIVE, and no live dataset holds that path.
 *
 * @see docs/design/groups/dataset-creation.md — Importing registers a directory somebody else already owns
 */

const path = require('path');
const fsp = require('node:fs/promises');
const os = require('node:os');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { importDataset } = require('@/services/datasets_v2/imports');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup,
} = require('../helpers');

let importer;
let ownGroup;
let otherGroup;
let tmpRoot;

const usersToDelete = [];
const groupsToDelete = [];
const sourcesToDelete = [];
const datasetsToDelete = [];

// Workflows are not started in these tests: rhythm is a separate service, and importDataset
// reports a failed start rather than failing the import. The dataset is what is asserted.
const user = () => ({ ...importer, roles: ['user'] });

beforeAll(async () => {
  importer = await createTestUser('_imp_user');
  usersToDelete.push(importer.id);

  ownGroup = await createTestGroup(importer.subject_id, '_imp_own');
  otherGroup = await createTestGroup(importer.subject_id, '_imp_other');
  groupsToDelete.push(ownGroup.id, otherGroup.id);

  await prisma.group_user.create({
    data: {
      group_id: ownGroup.id,
      user_id: importer.subject_id,
      role: 'ADMIN',
      assigned_by: importer.subject_id,
    },
  });

  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'bioloop_import_'));
  await fsp.mkdir(path.join(tmpRoot, 'own', 'RUN_ONE'), { recursive: true });
  await fsp.mkdir(path.join(tmpRoot, 'own', 'RUN_TWO'), { recursive: true });
  await fsp.mkdir(path.join(tmpRoot, 'other', 'NOT_YOURS'), { recursive: true });
  await fsp.mkdir(path.join(tmpRoot, 'down', 'RUN_GONE'), { recursive: true });

  const own = await prisma.import_source.create({
    data: {
      path: path.join(tmpRoot, 'own'), label: '_imp Own', owner_group_id: ownGroup.id, status: 'ACTIVE',
    },
  });
  const other = await prisma.import_source.create({
    data: {
      path: path.join(tmpRoot, 'other'), label: '_imp Other', owner_group_id: otherGroup.id, status: 'ACTIVE',
    },
  });
  const down = await prisma.import_source.create({
    data: {
      path: path.join(tmpRoot, 'down'),
      label: '_imp Down',
      owner_group_id: ownGroup.id,
      status: 'SUSPENDED',
      status_reason: 'Path is not readable',
    },
  });
  sourcesToDelete.push(own.id, other.id, down.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) {
    const d = await prisma.dataset.findUnique({ where: { id }, select: { resource_id: true } });
    if (d) await prisma.grant.deleteMany({ where: { resource_id: d.resource_id } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  await prisma.import_source.deleteMany({ where: { id: { in: sourcesToDelete } } });
  await prisma.group_user.deleteMany({ where: { group_id: { in: groupsToDelete } } });
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  if (tmpRoot) await fsp.rm(tmpRoot, { recursive: true, force: true });
  await prisma.$disconnect();
}, 30_000);

describe('importDataset', () => {
  test('registers a directory inside a source the caller can browse', async () => {
    const { dataset } = await importDataset({
      user: user(),
      data: {
        name: `import-one-${Date.now()}`,
        type: 'RAW_DATA',
        origin_path: path.join(tmpRoot, 'own', 'RUN_ONE'),
        owner_group_id: ownGroup.id,
      },
    });
    datasetsToDelete.push(dataset.id);

    expect(dataset.origin_path).toBe(path.join(tmpRoot, 'own', 'RUN_ONE'));
    expect(dataset.owner_group_id).toBe(ownGroup.id);
    expect(dataset.create_method).toBe('IMPORT');
  });

  test('writes an import log carrying the source it came from', async () => {
    const dataset = await prisma.dataset.findFirst({
      where: { id: { in: datasetsToDelete } },
      select: { id: true, import_logs: true },
    });

    expect(dataset.import_logs.length).toBeGreaterThan(0);
    expect(dataset.import_logs[0].metadata.import_source_id).toBeDefined();
  });

  test('refuses a directory in another group\'s source', async () => {
    await expect(importDataset({
      user: user(),
      data: {
        name: `import-forbidden-${Date.now()}`,
        type: 'RAW_DATA',
        origin_path: path.join(tmpRoot, 'other', 'NOT_YOURS'),
        owner_group_id: ownGroup.id,
      },
    })).rejects.toThrow(/import source you can import from/);
  });

  test('refuses a directory in a suspended source', async () => {
    await expect(importDataset({
      user: user(),
      data: {
        name: `import-suspended-${Date.now()}`,
        type: 'RAW_DATA',
        origin_path: path.join(tmpRoot, 'down', 'RUN_GONE'),
        owner_group_id: ownGroup.id,
      },
    })).rejects.toThrow(/not readable/);
  });

  test('refuses a directory another dataset already holds, naming neither', async () => {
    // Two datasets over the same bytes would mean each set of grants exposes the other's
    // files. The message must not say who holds it.
    let message;
    try {
      await importDataset({
        user: user(),
        data: {
          name: `import-duplicate-${Date.now()}`,
          type: 'RAW_DATA',
          origin_path: path.join(tmpRoot, 'own', 'RUN_ONE'),
          owner_group_id: ownGroup.id,
        },
      });
    } catch (err) {
      message = err.message;
    }

    expect(message).toMatch(/already registered/);
    expect(message).not.toMatch(/import-one/);
    expect(message).not.toMatch(new RegExp(ownGroup.name));
  });

  test('answers null when the group already holds the name', async () => {
    const name = `import-same-name-${Date.now()}`;
    const first = await importDataset({
      user: user(),
      data: {
        name, type: 'RAW_DATA', origin_path: path.join(tmpRoot, 'own', 'RUN_TWO'), owner_group_id: ownGroup.id,
      },
    });
    datasetsToDelete.push(first.dataset.id);

    await fsp.mkdir(path.join(tmpRoot, 'own', 'RUN_THREE'), { recursive: true });
    const second = await importDataset({
      user: user(),
      data: {
        name, type: 'RAW_DATA', origin_path: path.join(tmpRoot, 'own', 'RUN_THREE'), owner_group_id: ownGroup.id,
      },
    });

    expect(second.dataset).toBeNull();
  });
});
