/**
 * Writes a generated world into the database this process points at, and removes it again.
 *
 * The rows are the ones the reference model reads, written directly rather than through the
 * services, because a world holds states no single service call produces: a removed and an
 * expired membership, a revoked and a not-yet-started grant, a collection row that was taken
 * out. Every name carries a run tag, so two runs never collide on a unique column.
 *
 * The system principals and the quarantine group are the seeded rows, not copies, and the
 * quarantine group is archived by its own seed.
 *
 * Require `tests/testDatabase.js` first. This module writes thousands of rows.
 *
 * @see docs/design/groups/access-model.md — How the model is checked
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const { randomUUID } = require('crypto');

const { SUBJECT_TYPE, RESOURCE_TYPE } = require('@prisma/client');

const {
  AUTHENTICATED_USERS_GROUP_ID, PUBLIC_GROUP_ID, UNASSIGNED_DATASETS_GROUP_ID,
} = require('@/constants');

const SEEDED_PRINCIPALS = { PUBLIC: PUBLIC_GROUP_ID, AUTHENTICATED: AUTHENTICATED_USERS_GROUP_ID };
const HOUR = 60 * 60 * 1000;

/** A string safe for a slug or an archive key. */
const safe = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-');

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {import('./reference').World} world
 * @returns {Promise<{ tag: string, ids: Map<string, string>, cleanup: function(): Promise<void> }>}
 *   `ids` maps a world id to the database id the engine is called with: a user's subject id, a
 *   group's id, and a dataset's or collection's resource id.
 */
async function writeWorld(prisma, world) {
  const tag = `mw${Date.now().toString(36)}`;
  const ids = new Map();
  // Before every membership and grant row the world writes, so a removal or an end date
  // never precedes its start.
  const longAgo = new Date(world.now.getTime() - 90 * 24 * HOUR);
  const past = new Date(world.now.getTime() - HOUR);

  const created = { users: [], groups: [], resources: [] };

  const makeUser = async (label) => {
    const row = await prisma.user.create({
      data: {
        username: `${tag}_${label}`,
        email: `${tag}_${label}@test.invalid`,
        name: label,
        subject: { create: { type: SUBJECT_TYPE.USER } },
      },
    });
    created.users.push(row);
    return row;
  };

  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  const grantor = await makeUser('grantor');
  for (const u of world.users) {
    if (u.anonymous) continue;
    const row = await makeUser(u.id);
    ids.set(u.id, row.subject_id);
    if (u.platform_admin) await prisma.user_role.create({ data: { user_id: row.id, role_id: adminRole.id } });
  }

  // Groups arrive parents first. A seeded parent's closure is read from the database.
  const closure = new Map();
  const closureOf = async (groupId) => {
    if (!closure.has(groupId)) {
      const rows = await prisma.group_closure.findMany({ where: { descendant_id: groupId } });
      closure.set(groupId, rows.map((r) => ({ ancestor_id: r.ancestor_id, depth: r.depth })));
    }
    return closure.get(groupId);
  };
  for (const g of world.groups) {
    if (g.system_principal) {
      ids.set(g.id, SEEDED_PRINCIPALS[g.system_principal]);
    } else if (g.quarantine) {
      ids.set(g.id, UNASSIGNED_DATASETS_GROUP_ID);
    } else {
      const id = randomUUID();
      ids.set(g.id, id);
      const name = `${tag}_${g.id}`;
      await prisma.subject.create({ data: { id, type: SUBJECT_TYPE.GROUP } });
      await prisma.group.createMany({
        data: [{
          id,
          // `group_closure` below is derived from this, and a whole-table invariant asserts the
          // two agree. A world that wrote only the closure would leave its groups in the root
          // name space and fail that test from another worker.
          // @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
          parent_id: g.parent ? ids.get(g.parent) : null,
          name,
          slug: safe(name),
          archive_key: safe(name),
          allow_user_contributions: g.allow_user_contributions === true,
          profile_visibility: g.profile_visibility ?? 'PRIVATE',
          is_archived: g.archived === true,
          archived_at: g.archived === true ? longAgo : null,
        }],
      });
      created.groups.push(id);
      const rows = [{ ancestor_id: id, depth: 0 }];
      if (g.parent) {
        (await closureOf(ids.get(g.parent)))
          .forEach((r) => rows.push({ ancestor_id: r.ancestor_id, depth: r.depth + 1 }));
      }
      closure.set(id, rows);
      await prisma.group_closure.createMany({ data: rows.map((r) => ({ ...r, descendant_id: id })) });
    }
  }

  if (world.memberships.length) {
    await prisma.group_user.createMany({
      data: world.memberships.map((m) => ({
        group_id: ids.get(m.group),
        user_id: ids.get(m.user),
        role: m.role,
        assigned_at: longAgo,
        removed_at: m.removed ? past : null,
        valid_until: m.valid_until ?? null,
      })),
    });
  }

  for (const d of world.datasets) {
    const resource_id = randomUUID();
    await prisma.resource.create({ data: { id: resource_id, type: RESOURCE_TYPE.DATASET } });
    await prisma.dataset.create({
      data: {
        name: `${tag}_${d.id}`,
        type: 'RAW_DATA',
        owner_group_id: ids.get(d.owner),
        resource_id,
        is_deleted: d.deleted === true,
      },
    });
    ids.set(d.id, resource_id);
    created.resources.push(resource_id);
  }

  for (const c of world.collections) {
    const id = randomUUID();
    const name = `${tag}_${c.id}`;
    await prisma.resource.create({ data: { id, type: RESOURCE_TYPE.COLLECTION } });
    await prisma.collection.createMany({
      data: [{
        id,
        name,
        slug: safe(name),
        owner_group_id: ids.get(c.owner),
        profile_visibility: c.profile_visibility ?? 'PRIVATE',
        is_archived: c.archived === true,
        archived_at: c.archived === true ? longAgo : null,
      }],
    });
    ids.set(c.id, id);
    created.resources.push(id);
  }

  if (world.contains.length) {
    await prisma.collection_dataset.createMany({
      data: world.contains.map((row) => ({
        collection_id: ids.get(row.collection),
        dataset_id: ids.get(row.dataset),
        added_at: longAgo,
        removed_at: row.removed ? past : null,
      })),
    });
  }

  const typeIds = new Map((await prisma.grant_access_type.findMany({ select: { id: true, name: true } }))
    .map((t) => [t.name, t.id]));
  if (world.grants.length) {
    await prisma.grant.createMany({
      data: world.grants.map((g) => {
        if (!typeIds.has(g.access_type)) throw new Error(`dbWorld: no access type ${g.access_type}`);
        return {
          subject_id: ids.get(g.subject),
          resource_id: ids.get(g.resource),
          access_type_id: typeIds.get(g.access_type),
          granted_by: grantor.subject_id,
          creation_type: g.creation_type ?? 'MANUAL',
          valid_from: g.valid_from ?? longAgo,
          valid_until: g.valid_until ?? null,
          revoked_at: g.revoked ? past : null,
          revoked_by: g.revoked ? grantor.subject_id : null,
          revocation_type: g.revoked ? (g.revocation_type ?? 'MANUAL') : null,
        };
      }),
    });
  }

  async function cleanup() {
    const resourceIds = created.resources;
    const groupIds = created.groups;
    const userSubjects = created.users.map((u) => u.subject_id);
    const subjects = [...groupIds, ...userSubjects];
    await prisma.grant.deleteMany({
      where: { OR: [{ resource_id: { in: resourceIds } }, { subject_id: { in: subjects } }] },
    });
    await prisma.collection_dataset.deleteMany({ where: { collection_id: { in: resourceIds } } });
    await prisma.collection.deleteMany({ where: { id: { in: resourceIds } } });
    await prisma.dataset.deleteMany({ where: { resource_id: { in: resourceIds } } });
    await prisma.resource.deleteMany({ where: { id: { in: resourceIds } } });
    await prisma.group_user.deleteMany({
      where: { OR: [{ group_id: { in: groupIds } }, { user_id: { in: userSubjects } }] },
    });
    // `group.parent_id` is ON DELETE RESTRICT, and the check is immediate, so a parent cannot
    // go in the same statement as its children. Groups arrive parents first, so reversing the
    // creation order takes the leaves out ahead of what holds them.
    for (const id of [...groupIds].reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.group.deleteMany({ where: { id } });
    }
    await prisma.user_role.deleteMany({ where: { user_id: { in: created.users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users.map((u) => u.id) } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjects } } });
  }

  return { tag, ids, cleanup };
}

module.exports = { writeWorld };
