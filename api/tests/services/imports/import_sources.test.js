/**
 * import_sources.test.js
 *
 * Import sources belong to a group. A user sees only the sources of groups they can reach,
 * and a path is resolved against those same sources — scoping the list without scoping the
 * resolve would leave the contents readable to anyone who guessed a path.
 *
 * @see docs/design/groups/dataset-creation-plan.md — B1, B2
 */

const path = require('path');
const fsp = require('node:fs/promises');
const os = require('node:os');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const {
  listImportSourcesForUser,
  resolveImportSourceForUser,
  verifyImportSourcePaths,
  AUTOMATIC_SUSPENSION_REASON,
} = require('@/services/import_sources');
const { browseImportSource } = require('@/services/fs_v2');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup,
} = require('../helpers');

let insider;
let outsider;
let ownGroup;
let otherGroup;
let ownSource;
let otherSource;
let suspendedSource;
let tmpRoot;

const usersToDelete = [];
const groupsToDelete = [];
const sourcesToDelete = [];

beforeAll(async () => {
  insider = await createTestUser('_is_in');
  outsider = await createTestUser('_is_out');
  usersToDelete.push(insider.id, outsider.id);

  ownGroup = await createTestGroup(insider.subject_id, '_is_own');
  otherGroup = await createTestGroup(insider.subject_id, '_is_other');
  groupsToDelete.push(ownGroup.id, otherGroup.id);

  await prisma.group_user.create({
    data: {
      group_id: ownGroup.id,
      user_id: insider.subject_id,
      role: 'MEMBER',
      assigned_by: insider.subject_id,
    },
  });

  // A real directory tree, so browsing is exercised against a filesystem rather than a mock.
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'bioloop_fs_v2_'));
  await fsp.mkdir(path.join(tmpRoot, 'own', 'RUN_ALPHA'), { recursive: true });
  await fsp.mkdir(path.join(tmpRoot, 'own', 'RUN_BETA'), { recursive: true });
  await fsp.writeFile(path.join(tmpRoot, 'own', 'RUN_ALPHA', 'reads.fastq.gz'), 'x');
  await fsp.mkdir(path.join(tmpRoot, 'other', 'SECRET_RUN'), { recursive: true });

  ownSource = await prisma.import_source.create({
    data: {
      path: path.join(tmpRoot, 'own'), label: '_is Own Lab', owner_group_id: ownGroup.id, status: 'ACTIVE',
    },
  });
  otherSource = await prisma.import_source.create({
    data: {
      path: path.join(tmpRoot, 'other'), label: '_is Other Lab', owner_group_id: otherGroup.id, status: 'ACTIVE',
    },
  });
  suspendedSource = await prisma.import_source.create({
    data: {
      path: path.join(tmpRoot, 'gone'),
      label: '_is Gone Lab',
      owner_group_id: ownGroup.id,
      status: 'SUSPENDED',
      status_reason: 'Path is not readable',
    },
  });
  sourcesToDelete.push(ownSource.id, otherSource.id, suspendedSource.id);
}, 30_000);

afterAll(async () => {
  await prisma.import_source.deleteMany({ where: { id: { in: sourcesToDelete } } });
  await prisma.group_user.deleteMany({ where: { group_id: { in: groupsToDelete } } });
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  if (tmpRoot) await fsp.rm(tmpRoot, { recursive: true, force: true });
  await prisma.$disconnect();
}, 30_000);

const asUser = (u) => ({ subject_id: u.subject_id, roles: ['user'] });

describe('listImportSourcesForUser', () => {
  test('lists a source belonging to a group the user is in', async () => {
    const labels = (await listImportSourcesForUser(asUser(insider))).map((s) => s.label);

    expect(labels).toContain('_is Own Lab');
  });

  test('does not list another group\'s source', async () => {
    const labels = (await listImportSourcesForUser(asUser(insider))).map((s) => s.label);

    expect(labels).not.toContain('_is Other Lab');
  });

  test('lists a suspended source with its reason, rather than hiding it', async () => {
    // An unreadable path that simply vanished would read as "my data is gone".
    const sources = await listImportSourcesForUser(asUser(insider));
    const gone = sources.find((s) => s.label === '_is Gone Lab');

    expect(gone).toBeDefined();
    expect(gone.status).toBe('SUSPENDED');
    expect(gone.status_reason).toBe('Path is not readable');
  });

  test('never leaks mounted_path, which is an API deployment detail', async () => {
    const sources = await listImportSourcesForUser(asUser(insider));

    expect(sources.every((s) => !('mounted_path' in s))).toBe(true);
  });

  test('shows a user with no groups nothing', async () => {
    expect(await listImportSourcesForUser(asUser(outsider))).toEqual([]);
  });
});

describe('resolveImportSourceForUser', () => {
  test('resolves a path inside the user\'s own source', async () => {
    const resolved = await resolveImportSourceForUser(
      asUser(insider), path.join(tmpRoot, 'own', 'RUN_ALPHA'),
    );

    expect(resolved?.id).toBe(ownSource.id);
  });

  test('refuses a path inside another group\'s source', async () => {
    // The whole point: guessing the path is not enough.
    const resolved = await resolveImportSourceForUser(
      asUser(insider), path.join(tmpRoot, 'other', 'SECRET_RUN'),
    );

    expect(resolved).toBeNull();
  });

  test('marks a suspended source unavailable rather than serving it', async () => {
    const resolved = await resolveImportSourceForUser(
      asUser(insider), path.join(tmpRoot, 'gone', 'anything'),
    );

    expect(resolved?.unavailable).toBe(true);
  });
});

describe('browseImportSource', () => {
  const source = () => ({ path: path.join(tmpRoot, 'own'), mounted_path: null });

  test('a trailing slash lists the directory contents', async () => {
    const entries = await browseImportSource({
      source: source(), requestedPath: `${path.join(tmpRoot, 'own')}/`, dirs_only: true,
    });

    expect(entries.map((e) => e.name).sort()).toEqual(['RUN_ALPHA', 'RUN_BETA']);
  });

  test('an exact path without a slash resolves to that directory', async () => {
    const entries = await browseImportSource({
      source: source(), requestedPath: path.join(tmpRoot, 'own', 'RUN_ALPHA'), dirs_only: true,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('RUN_ALPHA');
  });

  test('a partial path matches siblings by substring', async () => {
    const entries = await browseImportSource({
      source: source(), requestedPath: path.join(tmpRoot, 'own', 'run_'), dirs_only: true,
    });

    expect(entries.map((e) => e.name).sort()).toEqual(['RUN_ALPHA', 'RUN_BETA']);
  });

  test('the extension filter keeps only directories holding such a file', async () => {
    const entries = await browseImportSource({
      source: source(),
      requestedPath: `${path.join(tmpRoot, 'own')}/`,
      dirs_only: true,
      extension: '.fastq.gz',
    });

    expect(entries.map((e) => e.name)).toEqual(['RUN_ALPHA']);
  });

  test('a parent outside the source returns nothing', async () => {
    // path.dirname of the source root climbs out of it.
    const entries = await browseImportSource({
      source: source(), requestedPath: path.join(tmpRoot, 'nope'), dirs_only: true,
    });

    expect(entries).toEqual([]);
  });
});

describe('verifyImportSourcePaths', () => {
  test('suspends a source whose path has gone away', async () => {
    // The source seeded at <tmp>/gone was never created on disk.
    const vanished = await prisma.import_source.create({
      data: {
        path: path.join(tmpRoot, 'vanished'),
        label: '_is Vanished Lab',
        owner_group_id: ownGroup.id,
        status: 'ACTIVE',
      },
    });
    sourcesToDelete.push(vanished.id);

    await verifyImportSourcePaths();

    const after = await prisma.import_source.findUnique({ where: { id: vanished.id } });
    expect(after.status).toBe('SUSPENDED');
    expect(after.status_reason).toBe(AUTOMATIC_SUSPENSION_REASON);
  });

  test('restores a source it suspended once the path is back', async () => {
    const flaky = await prisma.import_source.create({
      data: {
        path: path.join(tmpRoot, 'flaky'),
        label: '_is Flaky Lab',
        owner_group_id: ownGroup.id,
        status: 'SUSPENDED',
        status_reason: AUTOMATIC_SUSPENSION_REASON,
      },
    });
    sourcesToDelete.push(flaky.id);
    await fsp.mkdir(path.join(tmpRoot, 'flaky'), { recursive: true });

    await verifyImportSourcePaths();

    const after = await prisma.import_source.findUnique({ where: { id: flaky.id } });
    expect(after.status).toBe('ACTIVE');
    expect(after.path_verified_at).not.toBeNull();
  });

  test('leaves a suspension a person made alone, even when readable', async () => {
    // A human decision is not undone by a scheduled job noticing the path works.
    const held = await prisma.import_source.create({
      data: {
        path: path.join(tmpRoot, 'held'),
        label: '_is Held Lab',
        owner_group_id: ownGroup.id,
        status: 'SUSPENDED',
        status_reason: 'Suspended pending review by the data office',
      },
    });
    sourcesToDelete.push(held.id);
    await fsp.mkdir(path.join(tmpRoot, 'held'), { recursive: true });

    await verifyImportSourcePaths();

    const after = await prisma.import_source.findUnique({ where: { id: held.id } });
    expect(after.status).toBe('SUSPENDED');
    expect(after.status_reason).toBe('Suspended pending review by the data office');
  });

  test('stamps path_verified_at on a healthy source', async () => {
    await verifyImportSourcePaths();

    const after = await prisma.import_source.findUnique({ where: { id: ownSource.id } });
    expect(after.path_verified_at).not.toBeNull();
  });
});
