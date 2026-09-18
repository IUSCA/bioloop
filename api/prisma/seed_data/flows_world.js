/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
// cSpell: ignore Priya Raman Okafor Nwosu Adeyemi Ferreira Vasquez Baptiste

/**
 * The named fixture world from the end-to-end flows page, seeded so it can be walked by hand.
 *
 * The rest of the seed builds a large sample world whose memberships are decided by a hash,
 * which is fine for filling a screen and useless for testing an access model: nothing in it
 * says who administers what, and the answer moves whenever the user list changes. This module
 * builds the small world the flows are written against, where every person has a name, a
 * standing, and a reason to exist.
 *
 * It sits **beside** the sample world rather than replacing it. The two never interleave:
 * nothing here is passed to the hash generators in `groups.js`, and the groups here are
 * excluded from the sample world's access-request and system-principal grants.
 *
 * @see docs/design/groups/e2e-test-flows.md — The cast and the world
 */

/**
 * Ids are hand-written rather than generated, so a row in the database can be recognised as
 * belonging to this world at a glance. They are real v4 UUIDs: the 13th nibble is `4` and the
 * 17th is `8`, which is what Prisma's `@db.Uuid` columns and the API's `isUUID` validators
 * require.
 */
const GROUP_IDS = Object.freeze({
  center: 'f1005000-0000-4000-8000-000000000001',
  wongLab: 'f1005000-0000-4000-8000-000000000002',
  wongSequencing: 'f1005000-0000-4000-8000-000000000003',
  patelLab: 'f1005000-0000-4000-8000-000000000004',
  imagingCore: 'f1005000-0000-4000-8000-000000000005',
});

const COLLECTION_ID = 'f1005000-0000-4000-8000-000000000101';

/**
 * The hierarchy, parents before children.
 *
 *   Midwest Genomics Center
 *   ├── Wong Lab
 *   │   └── Wong Sequencing
 *   ├── Patel Lab
 *   └── Midwest Imaging Core
 *
 * **The imaging group is "Midwest Imaging Core", not "Imaging Core".** `slug` and
 * `archive_key` are unique across every group, and the sample world already holds a group
 * called Imaging Core whose slug is `imaging-core`. Names are only unique among siblings, so
 * the name alone would now be free; the slug is what this avoids colliding with. Nothing in
 * the flows depends on that group's exact name — it exists to own a dataset in a sibling
 * branch.
 * @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
 */
const GROUPS = Object.freeze([
  {
    id: GROUP_IDS.center,
    parent_id: null,
    name: 'Midwest Genomics Center',
    slug: 'midwest-genomics-center',
    tagline: 'The flows fixture: the center Dana governs and oversees.',
    metadata: { type: 'center' },
  },
  {
    id: GROUP_IDS.wongLab,
    parent_id: GROUP_IDS.center,
    name: 'Wong Lab',
    slug: 'wong-lab',
    tagline: 'The flows fixture: the lab every access flow is about.',
    metadata: { type: 'lab' },
  },
  {
    id: GROUP_IDS.wongSequencing,
    parent_id: GROUP_IDS.wongLab,
    name: 'Wong Sequencing',
    slug: 'wong-sequencing',
    tagline: 'The flows fixture: the sub-lab that proves membership rises.',
    metadata: { type: 'lab' },
  },
  {
    id: GROUP_IDS.patelLab,
    parent_id: GROUP_IDS.center,
    name: 'Patel Lab',
    slug: 'patel-lab',
    tagline: 'The flows fixture: the sibling branch that proves refusals run both ways.',
    metadata: { type: 'lab' },
  },
  {
    id: GROUP_IDS.imagingCore,
    parent_id: GROUP_IDS.center,
    name: 'Midwest Imaging Core',
    slug: 'midwest-imaging-core',
    tagline: 'The flows fixture: a second branch, for grant transitivity.',
    metadata: { type: 'core' },
  },
]);

const GROUP_ID_SET = Object.freeze(new Set(GROUPS.map((g) => g.id)));

/**
 * The cast, as accounts.
 *
 * **Vic is deliberately absent.** Vic is the invitee, and the invitation flows exist to prove
 * that inviting somebody with no account works. Seeding Vic would make those flows pass
 * without exercising the path they are about.
 *
 * **Priya is the only person here who holds a platform role.** A platform admin is allowed
 * before any policy runs, so every other account must hold `user` and nothing more, or a
 * refusal flow proves nothing. `test_user` is also a platform admin and stays one: it is the
 * general-purpose development account, and no flow asserts that exactly one exists.
 *
 * `role` is the platform role. `memberships` is the standing this person holds in this world,
 * and an empty list is a deliberate statement rather than an omission.
 */
const CAST = Object.freeze([
  {
    username: 'priya',
    name: 'Priya Raman',
    role: 'admin',
    memberships: [],
    stands_for: 'Platform admin. Reaches everything, subject to restrictions.',
  },
  {
    username: 'dana',
    name: 'Dana Okafor',
    role: 'user',
    memberships: [
      { group_id: GROUP_IDS.center, role: 'ADMIN' },
      // The imaging core needs an admin of its own, because flow F2 has its admin issue the
      // grant that Wong Lab receives. Dana is the least disruptive choice: she already
      // governs the branch, and the refusal flows turn on Erin and Frank rather than on her.
      { group_id: GROUP_IDS.imagingCore, role: 'ADMIN' },
    ],
    stands_for: 'Admin of the Center. Governance here, oversight of every descendant.',
  },
  {
    username: 'alice',
    name: 'Alice Wong',
    role: 'user',
    memberships: [{ group_id: GROUP_IDS.wongLab, role: 'ADMIN' }],
    stands_for: 'Admin of Wong Lab. Oversight of Wong Sequencing, and nothing sideways.',
  },
  {
    username: 'bob',
    name: 'Bob Ferreira',
    role: 'user',
    memberships: [{ group_id: GROUP_IDS.wongLab, role: 'MEMBER' }],
    stands_for: 'Member of Wong Lab, and transitively of the Center.',
  },
  {
    username: 'carol',
    name: 'Carol Nwosu',
    role: 'user',
    memberships: [{ group_id: GROUP_IDS.wongSequencing, role: 'MEMBER' }],
    stands_for: 'Member of Wong Sequencing. Proves membership rises two levels.',
  },
  {
    username: 'erin',
    name: 'Erin Vasquez',
    role: 'user',
    memberships: [{ group_id: GROUP_IDS.patelLab, role: 'ADMIN' }],
    stands_for: 'Admin of Patel Lab. Proves admin authority does not travel sideways.',
  },
  {
    username: 'frank',
    name: 'Frank Adeyemi',
    role: 'user',
    memberships: [{ group_id: GROUP_IDS.patelLab, role: 'MEMBER' }],
    stands_for: 'Member of Patel Lab. The outsider for every Wong Lab refusal.',
  },
  {
    username: 'quinn',
    name: 'Quinn Baptiste',
    role: 'user',
    // Quinn belongs to nothing and holds nothing. Flow H1 asserts that an account in this
    // state sees an empty portal, so a convenience membership here would break it silently.
    memberships: [],
    stands_for: 'Member of no group, holder of no grant. The empty-state case.',
  },
]);

/**
 * Wong Sequencing has no admin of its own, and that is the fixture being correct rather than
 * incomplete. Alice holds oversight of it through Wong Lab, which is the relationship flows
 * A2 and B5 are about, and the suite's own `cast.js` leaves its sub-lab admin-less for the
 * same reason. `getGroupsWithoutActiveAdmins` will list it, which is that helper reporting
 * accurately rather than a gap to fill.
 */

/**
 * The four datasets, each named by the flows page and owned by the group it names.
 *
 * `PCM230203` is also the name of a dataset in the sample world, owned by a different group.
 * That is legal — the unique key is `[owner_group_id, name, type, is_deleted]` — and it is
 * the same shape flow D4 asserts.
 */
const DATASETS = Object.freeze([
  {
    name: 'PCM230203',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.wongLab,
    description: 'The flows fixture: the dataset every access flow is about.',
    origin_path: '/origin/path/flows/PCM230203',
    num_directories: 12,
    num_files: 240,
    du_size: 48221044992,
    size: 48220991488,
  },
  {
    name: 'PCM230204',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.wongLab,
    description: 'The flows fixture: the second dataset, for collection and bulk flows.',
    origin_path: '/origin/path/flows/PCM230204',
    num_directories: 9,
    num_files: 181,
    du_size: 32115060736,
    size: 32115019776,
  },
  {
    name: 'IMG-0007',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.imagingCore,
    description: 'The flows fixture: a dataset in a sibling branch, for grant transitivity.',
    origin_path: '/origin/path/flows/IMG-0007',
    num_directories: 4,
    num_files: 96,
    du_size: 12884901888,
    size: 12884885504,
  },
  {
    name: 'PAT-1101',
    type: 'RAW_DATA',
    owner_group_id: GROUP_IDS.patelLab,
    description: "The flows fixture: Frank's own data, to prove refusals run both ways.",
    origin_path: '/origin/path/flows/PAT-1101',
    num_directories: 6,
    num_files: 128,
    du_size: 21474836480,
    size: 21474820096,
  },
]);

const COLLECTION = Object.freeze({
  id: COLLECTION_ID,
  name: 'Aim 2 Release',
  slug: 'aim-2-release',
  owner_group_id: GROUP_IDS.wongLab,
  tagline: 'The flows fixture: the collection holding both Wong Lab datasets.',
  dataset_names: ['PCM230203', 'PCM230204'],
});

/**
 * The closure rows for the hierarchy: every group reaches itself at depth 0, and every
 * ancestor reaches it at the number of edges between them.
 */
function buildClosure() {
  const parentOf = new Map(GROUPS.map((g) => [g.id, g.parent_id]));
  const rows = [];
  for (const g of GROUPS) {
    rows.push({ ancestor_id: g.id, descendant_id: g.id, depth: 0 });
    let ancestor = parentOf.get(g.id);
    let depth = 1;
    while (ancestor) {
      rows.push({ ancestor_id: ancestor, descendant_id: g.id, depth });
      ancestor = parentOf.get(ancestor);
      depth += 1;
    }
  }
  return rows;
}

/**
 * Writes the world.
 *
 * Written through Prisma rather than through the API, unlike the end-to-end suite's own
 * builder, because this runs as part of `npm run seed` when no server is listening.
 *
 * Every write is an upsert keyed on an id this file owns, so re-seeding is safe and never
 * produces a second copy. Order follows the model: subjects and groups, then closure, then
 * memberships, then datasets, then the collection.
 *
 * @param prisma — a PrismaClient
 * @param deps.SUBJECT_TYPE, deps.RESOURCE_TYPE — the Prisma enums
 * @param deps.systemAdminSubjectId — `svc_tasks`, recorded as the assigning authority
 * @returns the ids written, for the caller's logging
 */
async function seedFlowsWorld(prisma, { SUBJECT_TYPE, RESOURCE_TYPE, systemAdminSubjectId }) {
  // Subjects first: `group.id` is a foreign key into `subject`.
  for (const g of GROUPS) {
    await prisma.subject.upsert({
      where: { id: g.id },
      update: {},
      create: { id: g.id, type: SUBJECT_TYPE.GROUP },
    });
  }

  for (const g of GROUPS) {
    // eslint-disable-next-line no-unused-vars
    const { parent_id: _parentId, ...row } = g;
    await prisma.group.upsert({
      where: { id: g.id },
      update: {},
      // `archive_key` is derived from the slug at creation and never updated, so it is
      // written here rather than left to a service that this path does not call.
      create: { ...row, archive_key: g.slug },
    });
  }

  // Parentage is applied once every group row exists, so it does not depend on GROUPS being
  // ordered parent before child. It is the same fact buildClosure() walks below.
  // @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
  for (const g of GROUPS.filter((x) => x.parent_id != null)) {
    await prisma.group.update({ where: { id: g.id }, data: { parent_id: g.parent_id } });
  }

  for (const row of buildClosure()) {
    await prisma.group_closure.upsert({
      where: {
        ancestor_id_descendant_id: {
          ancestor_id: row.ancestor_id,
          descendant_id: row.descendant_id,
        },
      },
      update: {},
      create: row,
    });
  }

  // Memberships. The cast accounts are created by the ordinary user seeding in `data.js`,
  // so they are looked up rather than written here.
  const usernames = CAST.map((c) => c.username);
  const accounts = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { username: true, subject_id: true },
  });
  const subjectIdByUsername = new Map(accounts.map((u) => [u.username, u.subject_id]));

  const missing = usernames.filter((u) => !subjectIdByUsername.has(u));
  if (missing.length > 0) {
    // Refuse rather than seed a half-populated world: a flow driven as a person who does not
    // exist fails in a way that names the login, not the seed.
    throw new Error(
      `The flows cast is missing from the user table: ${missing.join(', ')}. `
      + 'They are seeded from seed_data/data.js — check that list first.',
    );
  }

  const memberships = [];
  for (const person of CAST) {
    for (const m of person.memberships) {
      memberships.push({
        group_id: m.group_id,
        user_id: subjectIdByUsername.get(person.username),
        role: m.role,
        assigned_by: systemAdminSubjectId,
      });
    }
  }
  // `group_user` has no composite key — a person may hold several memberships of one group
  // over time, at most one open. `skipDuplicates` relies on the partial unique index over
  // open rows, so re-seeding never opens a second membership.
  await prisma.group_user.createMany({ data: memberships, skipDuplicates: true });

  // Datasets. Each needs a `resource` row to be grantable.
  const datasetIdByName = new Map();
  for (const spec of DATASETS) {
    const existing = await prisma.dataset.findFirst({
      where: {
        name: spec.name,
        type: spec.type,
        is_deleted: false,
        owner_group_id: spec.owner_group_id,
      },
      select: { id: true, resource_id: true },
    });

    if (existing) {
      datasetIdByName.set(spec.name, existing);
    } else {
      const { owner_group_id: ownerGroupId, ...row } = spec;
      const created = await prisma.dataset.create({
        data: {
          ...row,
          owner_group: { connect: { id: ownerGroupId } },
          resource: { create: { type: RESOURCE_TYPE.DATASET } },
        },
        select: { id: true, resource_id: true },
      });
      datasetIdByName.set(spec.name, created);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.resource.upsert({
      where: { id: COLLECTION.id },
      update: {},
      create: { id: COLLECTION.id, type: RESOURCE_TYPE.COLLECTION },
    });

    const { dataset_names: datasetNames, ...row } = COLLECTION;
    await tx.collection.upsert({
      where: { id: COLLECTION.id },
      update: {},
      create: row,
    });

    await tx.collection_dataset.createMany({
      // `collection_dataset.dataset_id` references `dataset.resource_id`, not `dataset.id`.
      // The column is a String and `dataset.id` is an Int, so passing the wrong one is a type
      // error rather than a silently wrong row.
      data: datasetNames.map((name) => ({
        collection_id: COLLECTION.id,
        dataset_id: datasetIdByName.get(name).resource_id,
      })),
      skipDuplicates: true,
    });
  });

  return {
    groups: GROUPS.length,
    people: CAST.length,
    datasets: DATASETS.length,
    collections: 1,
  };
}

module.exports = {
  GROUP_IDS,
  GROUP_ID_SET,
  GROUPS,
  CAST,
  DATASETS,
  COLLECTION,
  buildClosure,
  seedFlowsWorld,
};
