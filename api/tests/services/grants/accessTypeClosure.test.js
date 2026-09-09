/**
 * accessTypeClosure.test.js
 *
 * The partial order over access types, and the two directions evaluation reads it in.
 *
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const grantsService = require('@/services/grants');
const {
  getAccessTypeClosure, satisfiedBy, expand, reduceToMaximalIds,
} = require('@/services/grants/accessTypeClosure');
const { GRANT_ACCESS_TYPES, GRANT_ACCESS_TYPE_IMPLICATIONS } = require('@/constants');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let member;
let group;
let dataset;

const createdGrantIds = [];
const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_atc_actor');
  member = await createTestUser('_atc_member');
  usersToDelete.push(actor.id, member.id);

  group = await createTestGroup(actor.subject_id, '_atc_group');
  groupsToDelete.push(group.id);

  dataset = await createTestDataset(group.id, '_atc_ds');
  datasetsToDelete.push(dataset.id);
}, 30_000);

afterAll(async () => {
  await prisma.grant.deleteMany({ where: { id: { in: createdGrantIds } } });
  for (const id of datasetsToDelete) {
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

async function accessTypeId(name) {
  const row = await prisma.grant_access_type.findFirst({ where: { name } });
  return row.id;
}

describe('the access type graph', () => {
  test('is acyclic', async () => {
    // getAccessTypeClosure throws on a cycle, so reaching a result is the assertion.
    const { impliesClosure } = await getAccessTypeClosure();

    // And no type reaches itself through an edge, only as the trivial member of its own
    // closure.
    const edgesByImplying = new Map();
    GRANT_ACCESS_TYPE_IMPLICATIONS.forEach(([implying, implied]) => {
      if (!edgesByImplying.has(implying)) edgesByImplying.set(implying, []);
      edgesByImplying.get(implying).push(implied);
    });

    impliesClosure.forEach((reachable, name) => {
      (edgesByImplying.get(name) || []).forEach((direct) => {
        expect(impliesClosure.get(direct).has(name)).toBe(false);
      });
    });
  });

  test('contains every seeded access type', async () => {
    const { impliesClosure, satisfiedByClosure } = await getAccessTypeClosure();

    GRANT_ACCESS_TYPES.forEach(({ name }) => {
      expect(impliesClosure.has(name)).toBe(true);
      expect(satisfiedByClosure.has(name)).toBe(true);
    });
  });

  test('every seeded edge names two access types that exist', async () => {
    const seeded = new Set(GRANT_ACCESS_TYPES.map((t) => t.name));

    GRANT_ACCESS_TYPE_IMPLICATIONS.forEach(([implying, implied]) => {
      expect(seeded.has(implying)).toBe(true);
      expect(seeded.has(implied)).toBe(true);
    });
  });

  test('the seeded rows match the constant', async () => {
    const rows = await prisma.grant_access_type_implication.findMany({
      include: { implying: true, implied: true },
    });
    const inDb = rows.map((r) => `${r.implying.name}->${r.implied.name}`).sort();
    const inCode = GRANT_ACCESS_TYPE_IMPLICATIONS.map(([a, b]) => `${a}->${b}`).sort();

    expect(inDb).toEqual(inCode);
  });

  // A preset that lists a type another member already implies asks for the same fact twice.
  // The write path reduces it away, so this asserts the seeded configuration and the code
  // agree about how many rows a preset is worth.
  // @see docs/design/groups/access-type-order-plan.md — Phase 2
  test('every seeded preset expands to a set with no implied member', async () => {
    const presets = await prisma.grant_preset.findMany({
      include: { access_type_items: true },
    });
    expect(presets.length).toBeGreaterThan(0);

    for (const preset of presets) {
      const ids = preset.access_type_items.map((i) => i.access_type_id);
      // eslint-disable-next-line no-await-in-loop
      const reduced = await reduceToMaximalIds(ids);

      // The reduction is idempotent: nothing in the reduced set implies anything else in it.
      // eslint-disable-next-line no-await-in-loop
      expect(await reduceToMaximalIds(reduced)).toEqual(reduced);
      expect(reduced.length).toBeGreaterThan(0);
    }
  });

  test('reduceToMaximalIds keeps a narrower type its wider one cannot cover', async () => {
    const idByName = new Map(
      (await prisma.grant_access_type.findMany()).map((t) => [t.name, t.id]),
    );
    const viewMetadata = idByName.get('DATASET:VIEW_METADATA');
    const download = idByName.get('DATASET:DOWNLOAD');

    // Download implies view metadata, so on the order alone it absorbs it.
    expect(await reduceToMaximalIds([viewMetadata, download])).toEqual([download]);

    // A caller that says download may not absorb it keeps both, which is how the write path
    // stops a month of download from cutting short a year of metadata access.
    expect(
      (await reduceToMaximalIds([viewMetadata, download], () => false)).sort(),
    ).toEqual([viewMetadata, download].sort());
  });

  test('is built once and cached, not recomputed per call', async () => {
    // Same object identity means the cached promise was reused rather than rebuilt.
    const first = await getAccessTypeClosure();
    const second = await getAccessTypeClosure();

    expect(second).toBe(first);
  });
});

describe('closing over the order', () => {
  test('a requirement is widened to everything that satisfies it', async () => {
    const satisfying = await satisfiedBy(['DATASET:VIEW_METADATA']);

    // Direct implying, and one reached transitively through LIST_FILES.
    expect(satisfying).toContain('DATASET:VIEW_METADATA');
    expect(satisfying).toContain('DATASET:LIST_FILES');
    expect(satisfying).toContain('DATASET:DOWNLOAD');
    // Nothing from the collection half of the graph.
    expect(satisfying).not.toContain('COLLECTION:VIEW_METADATA');
  });

  test('a holding is widened to everything it confers', async () => {
    const conferred = await expand(['DATASET:DOWNLOAD']);

    expect(conferred.has('DATASET:DOWNLOAD')).toBe(true);
    expect(conferred.has('DATASET:LIST_FILES')).toBe(true);
    expect(conferred.has('DATASET:VIEW_METADATA')).toBe(true);
    // Implication travels one way only: download does not confer compute.
    expect(conferred.has('DATASET:COMPUTE')).toBe(false);
  });

  test('a type with no edges is returned unchanged', async () => {
    // VIEW_METADATA sits at the bottom, so it confers only itself.
    const conferred = await expand(['DATASET:VIEW_METADATA']);

    expect([...conferred]).toEqual(['DATASET:VIEW_METADATA']);
  });

  test('an empty requirement stays empty', async () => {
    expect(await satisfiedBy([])).toEqual([]);
  });
});

describe('evaluation honours the order', () => {
  test('a download grant satisfies a metadata check', async () => {
    const grant = await grantsService.createGrant(
      {
        subject_id: member.subject_id,
        resource_id: dataset.resource_id,
        access_type_id: await accessTypeId('DATASET:DOWNLOAD'),
      },
      actor.subject_id,
    );
    createdGrantIds.push(grant.id);

    const hasMetadata = await grantsService.userHasGrant({
      user_id: member.subject_id,
      resource_type: 'DATASET',
      resource_id: dataset.resource_id,
      access_types: ['DATASET:VIEW_METADATA'],
    });

    expect(hasMetadata).toBe(true);
  });

  test('the same grant satisfies the intermediate check too', async () => {
    const hasListFiles = await grantsService.userHasGrant({
      user_id: member.subject_id,
      resource_type: 'DATASET',
      resource_id: dataset.resource_id,
      access_types: ['DATASET:LIST_FILES'],
    });

    expect(hasListFiles).toBe(true);
  });

  test('it does not satisfy a check the order does not reach', async () => {
    const hasCompute = await grantsService.userHasGrant({
      user_id: member.subject_id,
      resource_type: 'DATASET',
      resource_id: dataset.resource_id,
      access_types: ['DATASET:COMPUTE'],
    });

    expect(hasCompute).toBe(false);
  });

  test('the reported access types include the implied ones', async () => {
    const types = await grantsService.getGrantAccessTypesForUser(
      member.subject_id,
      dataset.resource_id,
      'DATASET',
    );

    expect(types.has('DATASET:DOWNLOAD')).toBe(true);
    expect(types.has('DATASET:LIST_FILES')).toBe(true);
    expect(types.has('DATASET:VIEW_METADATA')).toBe(true);
    expect(types.has('DATASET:COMPUTE')).toBe(false);
  });

  test('a user with no grant is unaffected by the order', async () => {
    const stranger = await createTestUser('_atc_stranger');
    usersToDelete.push(stranger.id);

    const has = await grantsService.userHasGrant({
      user_id: stranger.subject_id,
      resource_type: 'DATASET',
      resource_id: dataset.resource_id,
      access_types: ['DATASET:VIEW_METADATA'],
    });

    expect(has).toBe(false);
  });
});
