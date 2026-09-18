/**
 * operationSequences.test.js
 *
 * Random sequences of operations, run against the service layer and against a model of what the
 * operations table decides. The model starts from the world the services built and then changes
 * only as the table says each command should change it.
 *
 * After every command, two checks run:
 *
 * 1. **Effects.** The database, read back into the reference model's world shape, equals the
 *    model: memberships, grants, collection contents, archived columns, deletions, and group
 *    settings. One cell the world shape does not hold is checked directly: a pending invitation
 *    is valid exactly while its own group is not archived.
 * 2. **Agreement.** The engine and the reference model, run on the model's world, decide the same
 *    for every user and resource on reading, editing, contributing, and downloading.
 *
 * A command the table refuses — removing a last admin, changing a restricted group or
 * collection — is run too, and must be refused with nothing
 * changed.
 *
 * The budget is `MODEL_SEQUENCE_RUNS` sequences of up to `MODEL_SEQUENCE_COMMANDS` commands, and
 * `MODEL_SEQUENCE_SEED` replays one. fast-check prints the seed and the shrunk sequence on failure.
 * The defaults are a measured run time, not a derived figure. Sequential commands find no races;
 * the concurrency suites own those.
 *
 * @see docs/design/groups/access-model.md — How the model is checked
 * @see docs/design/groups/design.md — Operation Effects
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax, max-classes-per-file, class-methods-use-this,
   no-param-reassign, no-use-before-define, max-len */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

// eslint-disable-next-line import/no-extraneous-dependencies
const fc = require('fast-check');
const _ = require('lodash/fp');

const prisma = require('@/db');
const { authorizeAction, policyRegistry } = require('@/authorization');
const groupsService = require('@/services/groups');
const collectionsService = require('@/services/collections');
const grantsService = require('@/services/grants');
const profilesService = require('@/services/profiles');
const invitationsService = require('@/services/invitations');
const datasetService = require('@/services/datasets_v2');
const { PUBLIC_GROUP_ID, AUTHENTICATED_USERS_GROUP_ID } = require('@/constants');
const {
  createTestUser, createTestGroup, createTestChildGroup, createTestDataset, createTestCollection,
  deleteCollection, deleteDataset, deleteGroup, deleteUser,
} = require('../services/helpers');

const { modelTablesFrom } = require('./tables');
const { createReference } = require('./reference');

const RUNS = Number(process.env.MODEL_SEQUENCE_RUNS ?? 30);
const MAX_COMMANDS = Number(process.env.MODEL_SEQUENCE_COMMANDS ?? 25);
const SEED = process.env.MODEL_SEQUENCE_SEED ? Number(process.env.MODEL_SEQUENCE_SEED) : Date.now() % (2 ** 31);

const tables = modelTablesFrom(policyRegistry);

const USERS = ['alice', 'bob', 'carol', 'dan'];
const GROUPS = ['center', 'lab'];
const DATASETS = ['d1', 'd2'];
const COLLECTIONS = ['c1', 'c2'];
const AGREEMENT_ACTIONS = {
  group: ['view_metadata', 'edit_metadata', 'view_profile'],
  collection: ['view_metadata', 'edit_metadata'],
  dataset: ['view_metadata', 'edit_metadata', 'contribute', 'download'],
};
const GRANT_TYPES = {
  dataset: ['DATASET:VIEW_METADATA', 'DATASET:LIST_FILES', 'DATASET:DOWNLOAD'],
  collection: ['COLLECTION:VIEW_METADATA', 'COLLECTION:LIST_CONTENTS'],
};

/** The label the checks carry before any command has run. */
const INITIAL_WORLD = { toString: _.constant('initial world') };

const statusOf = (promise) => promise.then(() => 200, (err) => err.status ?? err.statusCode ?? 500);
const freshContext = () => ({ cache: { user: new Map(), resource: new Map(), context: new Map() } });

// ---- the world ------------------------------------------------------------------------------

/** Builds the world through the services, and the maps between world ids and database ids. */
async function buildReal() {
  const tag = `seq${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const users = {};
  for (const name of USERS) users[name] = await createTestUser(`_${tag}_${name}`);
  const center = await createTestGroup(users.carol.subject_id, `_${tag}_center`);
  const lab = await createTestChildGroup(center.id, users.alice.subject_id, `_${tag}_lab`);
  await prisma.group_user.createMany({
    data: [
      { group_id: center.id, user_id: users.carol.subject_id, role: 'ADMIN' },
      { group_id: lab.id, user_id: users.alice.subject_id, role: 'ADMIN' },
      { group_id: lab.id, user_id: users.bob.subject_id, role: 'MEMBER' },
    ],
  });
  const datasets = {};
  for (const name of DATASETS) datasets[name] = await createTestDataset(lab.id, `_${tag}_${name}`);
  const collections = {};
  for (const name of COLLECTIONS) collections[name] = await createTestCollection(lab.id, users.alice.subject_id, `_${tag}_${name}`);
  const { invitation } = await invitationsService.createInvitation({
    group_id: lab.id, email: `${tag}@example.org`, invited_by: users.alice.subject_id,
  });

  const ids = new Map([
    ...USERS.map((u) => [u, users[u].subject_id]),
    ['center', center.id], ['lab', lab.id],
    ...DATASETS.map((d) => [d, datasets[d].resource_id]),
    ...COLLECTIONS.map((c) => [c, collections[c].id]),
    ['public', PUBLIC_GROUP_ID], ['authenticated', AUTHENTICATED_USERS_GROUP_ID],
  ]);
  const back = new Map([...ids.entries()].map(([k, v]) => [v, k]));
  return {
    tag, users, center, lab, datasets, collections, invitation, ids, back,
  };
}

async function cleanup(real) {
  await prisma.group_invitation.deleteMany({ where: { group_id: real.lab.id } });
  for (const g of [real.lab, real.center]) {
    await groupsService.unarchiveGroup(g.id, real.users.carol.subject_id).catch(() => {});
  }
  for (const c of Object.values(real.collections)) await deleteCollection(c.id).catch(() => {});
  for (const d of Object.values(real.datasets)) await deleteDataset(d.id).catch(() => {});
  await deleteGroup(real.lab.id).catch(() => {});
  await deleteGroup(real.center.id).catch(() => {});
  for (const u of Object.values(real.users)) await deleteUser(u.id).catch(() => {});
}

/** The database state of the world, in the reference model's shape. */
async function snapshot(real) {
  const { ids, back } = real;
  const groupIds = GROUPS.map((g) => ids.get(g));
  const collectionIds = COLLECTIONS.map((c) => ids.get(c));
  const resourceIds = [...DATASETS.map((d) => ids.get(d)), ...collectionIds];

  const [groups, parents, users, memberships, datasets, collections, contains, grants] = await Promise.all([
    prisma.group.findMany({ where: { id: { in: groupIds } } }),
    prisma.group_closure.findMany({ where: { descendant_id: { in: groupIds }, depth: 1 } }),
    prisma.user.findMany({ where: { subject_id: { in: USERS.map((u) => ids.get(u)) } } }),
    prisma.active_group_user.findMany({ where: { group_id: { in: groupIds } } }),
    prisma.dataset.findMany({ where: { resource_id: { in: DATASETS.map((d) => ids.get(d)) } } }),
    prisma.collection.findMany({ where: { id: { in: collectionIds } } }),
    prisma.active_collection_dataset.findMany({ where: { collection_id: { in: collectionIds } } }),
    prisma.$queryRaw`
      SELECT g.id, g.subject_id, g.resource_id, gat.name AS access_type, s.type AS subject_type
      FROM valid_grants g
      JOIN grant_access_type gat ON gat.id = g.access_type_id
      JOIN subject s ON s.id = g.subject_id
      WHERE g.resource_id = ANY(${resourceIds}::text[])`,
  ]);
  return {
    world: {
      now: new Date(),
      users: users.map((u) => ({ id: back.get(u.subject_id), deleted: u.is_deleted })),
      groups: [
        { id: 'public', parent: null, system_principal: 'PUBLIC' },
        { id: 'authenticated', parent: null, system_principal: 'AUTHENTICATED' },
        ...groups.map((g) => ({
          id: back.get(g.id),
          parent: back.get(parents.find((edge) => edge.descendant_id === g.id)?.ancestor_id) ?? null,
          allow_user_contributions: g.allow_user_contributions,
          profile_visibility: g.profile_visibility,
          archived: g.is_archived,
        })),
      ],
      memberships: memberships.map((m) => ({ user: back.get(m.user_id), group: back.get(m.group_id), role: m.role })),
      datasets: datasets.map((d) => ({ id: back.get(d.resource_id), owner: back.get(d.owner_group_id), deleted: d.is_deleted })),
      collections: collections.map((c) => ({
        id: back.get(c.id),
        owner: back.get(c.owner_group_id),
        profile_visibility: c.profile_visibility,
        archived: c.is_archived,
      })),
      contains: contains.map((row) => ({ collection: back.get(row.collection_id), dataset: back.get(row.dataset_id) })),
      grants: grants.map((g) => ({
        id: g.id,
        subject_type: g.subject_type,
        subject: back.get(g.subject_id) ?? g.subject_id,
        resource: back.get(g.resource_id),
        access_type: g.access_type,
      })),
    },
  };
}

/** A world as sorted strings per relation, so two worlds compare with one `toEqual`. */
function normalize(world) {
  const sorted = (rows, key) => rows.map(key).sort();
  return {
    users: sorted(world.users, (u) => `${u.id}|${Boolean(u.deleted)}`),
    groups: sorted(
      world.groups.filter((g) => !g.system_principal),
      (g) => `${g.id}|${g.parent}|${Boolean(g.allow_user_contributions)}|${g.profile_visibility}`
        + `|${Boolean(g.archived)}`,
    ),
    memberships: sorted(world.memberships, (m) => `${m.user}|${m.group}|${m.role}`),
    datasets: sorted(world.datasets, (d) => `${d.id}|${d.owner}|${Boolean(d.deleted)}`),
    collections: sorted(world.collections, (c) => `${c.id}|${c.owner}|${c.profile_visibility}|${Boolean(c.archived)}`),
    contains: sorted(world.contains, (row) => `${row.collection}|${row.dataset}`),
    grants: sorted(world.grants, (g) => `${g.id}|${g.subject}|${g.resource}|${g.access_type}`),
  };
}

// ---- what the model knows -------------------------------------------------------------------

const groupOf = (world, id) => world.groups.find((g) => g.id === id);
const collectionRow = (world, id) => world.collections.find((c) => c.id === id);
const datasetRow = (world, id) => world.datasets.find((d) => d.id === id);
/** The archived column on a group or a collection. A dataset has none. */
const archived = (world, target) => (groupOf(world, target) ?? collectionRow(world, target))?.archived === true;

/**
 * Whether the resource's own state refuses a change to it. A collection or dataset reads its
 * own column and its owning group's, one step, never an ancestor chain: archiving a group
 * covers that group and what it owns, and a sub-group keeps its own state.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */
const resourceStateRefuses = (world, id) => {
  const row = collectionRow(world, id) ?? datasetRow(world, id);
  return archived(world, id) || archived(world, row.owner);
};
const membership = (world, user, group) => world.memberships.find((m) => m.user === user && m.group === group);
const isDeletedUser = (world, user) => world.users.find((u) => u.id === user)?.deleted === true;
/** Whether taking `user` out of the admins of `group` would leave an admin-held group with none. */
const wouldLoseLastAdmin = (world, user, group) => {
  const admins = world.memberships.filter((m) => m.group === group && m.role === 'ADMIN'
    && !isDeletedUser(world, m.user));
  return admins.some((m) => m.user === user) && admins.length === 1;
};

// ---- commands -------------------------------------------------------------------------------

class Command {
  // eslint-disable-next-line lodash-fp/prefer-constant
  check() { return true; }

  /** Runs on the real system, and applies the decided effect to the model. */
  async run(model, real) {
    model.kinds.add(this.constructor.name);
    await this.apply(model, real);
    await verify(model, real, this);
  }
}

class AddMember extends Command {
  constructor(user, group) { super(); Object.assign(this, { user, group }); }

  check(model) { return !membership(model.world, this.user, this.group); }

  async apply(model, real) {
    const status = await statusOf(groupsService.addGroupMembers(real.ids.get(this.group), {
      user_ids: [real.ids.get(this.user)], actor_id: real.users.carol.subject_id,
    }));
    if (archived(model.world, this.group)) {
      expect([this.toString(), status]).toEqual([this.toString(), 409]);
      model.refused += 1;
    } else {
      expect([this.toString(), status]).toEqual([this.toString(), 200]);
      model.world.memberships.push({ user: this.user, group: this.group, role: 'MEMBER' });
    }
  }

  toString() { return `add ${this.user} to ${this.group}`; }
}

class RemoveMember extends Command {
  constructor(user, group) { super(); Object.assign(this, { user, group }); }

  check(model) { return Boolean(membership(model.world, this.user, this.group)); }

  async apply(model, real) {
    const status = await statusOf(groupsService.removeGroupMembers(real.ids.get(this.group), {
      user_ids: [real.ids.get(this.user)], actor_id: real.users.carol.subject_id,
    }));
    if (archived(model.world, this.group) || wouldLoseLastAdmin(model.world, this.user, this.group)) {
      expect([this.toString(), status]).toEqual([this.toString(), 409]);
      model.refused += 1;
    } else {
      expect([this.toString(), status]).toEqual([this.toString(), 200]);
      // Direct grants stay: a grant names its subject, not a membership. @see decision 16, row 1
      model.world.memberships = model.world.memberships.filter((m) => m !== membership(model.world, this.user, this.group));
    }
  }

  toString() { return `remove ${this.user} from ${this.group}`; }
}

class Promote extends Command {
  constructor(user, group) { super(); Object.assign(this, { user, group }); }

  check(model) {
    return membership(model.world, this.user, this.group)?.role === 'MEMBER' && !archived(model.world, this.group);
  }

  async apply(model, real) {
    await groupsService.promoteGroupMemberToAdmin(real.ids.get(this.group), {
      user_id: real.ids.get(this.user), actor_id: real.users.carol.subject_id,
    });
    membership(model.world, this.user, this.group).role = 'ADMIN';
  }

  toString() { return `promote ${this.user} in ${this.group}`; }
}

class Demote extends Command {
  constructor(user, group) { super(); Object.assign(this, { user, group }); }

  check(model) {
    return membership(model.world, this.user, this.group)?.role === 'ADMIN' && !archived(model.world, this.group);
  }

  async apply(model, real) {
    const status = await statusOf(groupsService.demoteAdminToMember(real.ids.get(this.group), {
      user_id: real.ids.get(this.user), actor_id: real.users.carol.subject_id,
    }));
    if (wouldLoseLastAdmin(model.world, this.user, this.group)) {
      expect([this.toString(), status]).toEqual([this.toString(), 409]);
      model.refused += 1;
    } else {
      expect([this.toString(), status]).toEqual([this.toString(), 200]);
      membership(model.world, this.user, this.group).role = 'MEMBER';
    }
  }

  toString() { return `demote ${this.user} in ${this.group}`; }
}

class ArchiveGroup extends Command {
  constructor(group) { super(); this.group = group; }

  check(model) { return !archived(model.world, this.group); }

  async apply(model, real) {
    await groupsService.archiveGroup(real.ids.get(this.group), real.users.carol.subject_id);
    // Grants, invitations, and requests are left. A sub-group keeps its own state, so nothing
    // below this group changes. @see decision 16, row 6
    groupOf(model.world, this.group).archived = true;
  }

  toString() { return `archive ${this.group}`; }
}

class UnarchiveGroup extends Command {
  constructor(group) { super(); this.group = group; }

  check(model) { return archived(model.world, this.group); }

  async apply(model, real) {
    await groupsService.unarchiveGroup(real.ids.get(this.group), real.users.carol.subject_id);
    groupOf(model.world, this.group).archived = false;
  }

  toString() { return `unarchive ${this.group}`; }
}

class ArchiveCollection extends Command {
  constructor(collection) { super(); this.collection = collection; }

  check(model) {
    return Boolean(collectionRow(model.world, this.collection)) && !resourceStateRefuses(model.world, this.collection);
  }

  async apply(model, real) {
    await collectionsService.archiveCollection(real.ids.get(this.collection), real.users.alice.subject_id);
    // A contained dataset keeps its own state. @see decision 16, row 3
    collectionRow(model.world, this.collection).archived = true;
  }

  toString() { return `archive ${this.collection}`; }
}

class UnarchiveCollection extends Command {
  constructor(collection) { super(); this.collection = collection; }

  check(model) { return Boolean(collectionRow(model.world, this.collection)) && archived(model.world, this.collection); }

  async apply(model, real) {
    await collectionsService.unarchiveCollection(real.ids.get(this.collection), real.users.alice.subject_id);
    collectionRow(model.world, this.collection).archived = false;
  }

  toString() { return `unarchive ${this.collection}`; }
}

class AddToCollection extends Command {
  constructor(collection, dataset) { super(); Object.assign(this, { collection, dataset }); }

  check(model) {
    return Boolean(collectionRow(model.world, this.collection))
      && !model.world.contains.some((row) => row.collection === this.collection && row.dataset === this.dataset);
  }

  async apply(model, real) {
    const status = await statusOf(collectionsService.addDatasets(real.ids.get(this.collection), {
      dataset_resource_ids: [real.ids.get(this.dataset)], actor_id: real.users.alice.subject_id,
    }));
    if (resourceStateRefuses(model.world, this.collection)) {
      // The collection's state answers first, so an archived collection or an archived owning
      // group is a conflict. @see decision 17
      expect([this.toString(), status]).toEqual([this.toString(), 409]);
      model.refused += 1;
    } else if (datasetRow(model.world, this.dataset).deleted) {
      // A deleted dataset is a bad dataset list, which is the caller's error, not a state.
      expect([this.toString(), status]).toEqual([this.toString(), 400]);
      model.refused += 1;
    } else {
      expect([this.toString(), status]).toEqual([this.toString(), 200]);
      model.world.contains.push({ collection: this.collection, dataset: this.dataset });
    }
  }

  toString() { return `add ${this.dataset} to ${this.collection}`; }
}

class RemoveFromCollection extends Command {
  constructor(collection, dataset) { super(); Object.assign(this, { collection, dataset }); }

  check(model) {
    return model.world.contains.some((row) => row.collection === this.collection && row.dataset === this.dataset);
  }

  async apply(model, real) {
    const status = await statusOf(collectionsService.removeDatasets(real.ids.get(this.collection), {
      dataset_resource_ids: [real.ids.get(this.dataset)], actor_id: real.users.alice.subject_id,
    }));
    if (resourceStateRefuses(model.world, this.collection)) {
      expect([this.toString(), status]).toEqual([this.toString(), 409]);
      model.refused += 1;
    } else {
      expect([this.toString(), status]).toEqual([this.toString(), 200]);
      // The history row stays. @see decision 1
      model.world.contains = model.world.contains
        .filter((row) => !(row.collection === this.collection && row.dataset === this.dataset));
    }
  }

  toString() { return `remove ${this.dataset} from ${this.collection}`; }
}

class IssueGrant extends Command {
  constructor(subject, resource, pick) { super(); Object.assign(this, { subject, resource, pick }); }

  resourceType(model) { return datasetRow(model.world, this.resource) ? 'dataset' : 'collection'; }

  check(model) {
    const exists = datasetRow(model.world, this.resource) || collectionRow(model.world, this.resource);
    return Boolean(exists) && !resourceStateRefuses(model.world, this.resource)
      && !datasetRow(model.world, this.resource)?.deleted
      && !model.world.grants.some((g) => g.subject === this.subject && g.resource === this.resource);
  }

  async apply(model, real) {
    const types = GRANT_TYPES[this.resourceType(model)];
    const accessType = types[this.pick % types.length];
    const type = await prisma.grant_access_type.findFirstOrThrow({ where: { name: accessType } });
    const grant = await grantsService.createGrant({
      subject_id: real.ids.get(this.subject),
      resource_id: real.ids.get(this.resource),
      access_type_id: type.id,
      creation_type: 'MANUAL',
      issuing_authority_id: real.lab.id,
    }, real.users.alice.subject_id);
    model.world.grants.push({
      id: grant.id,
      subject_type: GROUPS.includes(this.subject) ? 'GROUP' : 'USER',
      subject: this.subject,
      resource: this.resource,
      access_type: accessType,
    });
  }

  toString() { return `grant ${this.subject} type #${this.pick} on ${this.resource}`; }
}

class RevokeGrant extends Command {
  constructor(pick) { super(); this.pick = pick; }

  target(model) {
    const revocable = model.world.grants.filter((g) => !resourceStateRefuses(model.world, g.resource)
      && !datasetRow(model.world, g.resource)?.deleted);
    return revocable.length ? revocable[this.pick % revocable.length] : null;
  }

  check(model) { return this.target(model) !== null; }

  async apply(model, real) {
    const grant = this.target(model);
    this.revoked = `${grant.subject} ${grant.access_type} on ${grant.resource}`;
    await grantsService.revokeGrant(grant.id, { actor_id: real.users.alice.subject_id, reason: 'sequence' });
    model.world.grants = model.world.grants.filter((g) => g.id !== grant.id);
  }

  toString() { return `revoke grant #${this.pick}${this.revoked ? ` (${this.revoked})` : ''}`; }
}

class ToggleContributions extends Command {
  constructor(group) { super(); this.group = group; }

  async apply(model, real) {
    const id = real.ids.get(this.group);
    const current = await prisma.group.findUniqueOrThrow({ where: { id } });
    const status = await statusOf(groupsService.updateGroupMetadata(id, {
      data: { allow_user_contributions: !current.allow_user_contributions },
      expected_version: current.version,
      actor_id: real.users.carol.subject_id,
    }));
    if (archived(model.world, this.group)) {
      expect([this.toString(), status]).toEqual([this.toString(), 409]);
      model.refused += 1;
    } else {
      expect([this.toString(), status]).toEqual([this.toString(), 200]);
      const row = groupOf(model.world, this.group);
      row.allow_user_contributions = !row.allow_user_contributions;
    }
  }

  toString() { return `toggle contributions on ${this.group}`; }
}

class ChangeVisibility extends Command {
  constructor(group, visibility) { super(); Object.assign(this, { group, visibility }); }

  check(model) { return groupOf(model.world, this.group).profile_visibility !== this.visibility; }

  async apply(model, real) {
    const id = real.ids.get(this.group);
    const current = await prisma.group.findUniqueOrThrow({ where: { id } });
    const status = await statusOf(profilesService.updateGroupProfile(id, {
      data: { profile_visibility: this.visibility },
      expected_version: current.version,
      actor_id: real.users.carol.subject_id,
    }));
    if (archived(model.world, this.group)) {
      expect([this.toString(), status]).toEqual([this.toString(), 409]);
      model.refused += 1;
    } else {
      expect([this.toString(), status]).toEqual([this.toString(), 200]);
      groupOf(model.world, this.group).profile_visibility = this.visibility;
    }
  }

  toString() { return `make ${this.group} ${this.visibility}`; }
}

class SoftDeleteDataset extends Command {
  constructor(dataset) { super(); this.dataset = dataset; }

  // Deleting is a governance change, so an archived owning group refuses it the way it refuses
  // an edit. The dataset itself has no archived state: its lifecycle ends here.
  // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
  check(model) {
    return !datasetRow(model.world, this.dataset).deleted
      && !resourceStateRefuses(model.world, this.dataset);
  }

  async apply(model, real) {
    await datasetService.softDelete(real.datasets[this.dataset].id, real.users.alice.id);
    // Grants, requests, and collection rows are left; mutations and the bytes are refused.
    // @see decision 16, row 4
    datasetRow(model.world, this.dataset).deleted = true;
  }

  toString() { return `soft-delete ${this.dataset}`; }
}

class SoftDeleteUser extends Command {
  constructor(user) { super(); this.user = user; }

  check(model) { return !isDeletedUser(model.world, this.user); }

  async apply(model, real) {
    // No v2 service deletes an account; the flag is what every reader consults.
    await prisma.user.update({ where: { subject_id: real.ids.get(this.user) }, data: { is_deleted: true } });
    // Memberships and grants stay; the account stops counting as an admin. @see decision 16, row 5
    model.world.users.find((u) => u.id === this.user).deleted = true;
  }

  toString() { return `soft-delete ${this.user}`; }
}

// ---- the two checks -------------------------------------------------------------------------

async function verify(model, real, command) {
  const label = command.toString();
  const { world: actual } = await snapshot(real);

  // 1. Effects. The archived column is part of the comparison, so a missed archive write fails
  // here rather than in an invariant of its own.
  expect([label, normalize(actual)]).toEqual([label, normalize(model.world)]);
  // An invitation is answered through the state layer, which reads the inviting group's own
  // archived column. Archiving an ancestor closes that ancestor and what it owns, and leaves a
  // sub-group to be archived in its own right, so `lab` keeps issuing valid tokens while
  // `center` is archived. Every command above reads one step for the same reason.
  // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
  const { status: invitation } = await invitationsService.checkInvitationToken(real.invitation.token);
  expect([label, 'invitation', invitation])
    .toEqual([label, 'invitation', archived(model.world, 'lab') ? 'invalid' : 'valid']);

  // 2. Agreement.
  const reference = createReference(tables, model.world);
  const resources = [
    ...GROUPS.map((id) => ['group', id]),
    ...model.world.collections.map((c) => ['collection', c.id]),
    ...DATASETS.map((id) => ['dataset', id]),
  ];
  const disagreements = [];
  for (const user of USERS) {
    for (const [resourceType, id] of resources) {
      for (const action of AGREEMENT_ACTIONS[resourceType]) {
        const expected = reference.decide(user, resourceType, action, id).allowed;
        const decision = await authorizeAction(resourceType, action, {
          identifiers: { user: real.ids.get(user), resource: real.ids.get(id) },
          policyExecutionContext: freshContext(),
        });
        if (decision.granted !== expected) {
          disagreements.push(`${user} ${resourceType}.${action} ${id}: engine ${decision.granted}, reference ${expected}`);
        }
      }
    }
  }
  expect([label, disagreements]).toEqual([label, []]);
  model.checked += 1;
}

// ---- the property ---------------------------------------------------------------------------

const user = fc.constantFrom(...USERS);
const group = fc.constantFrom(...GROUPS);
const collection = fc.constantFrom(...COLLECTIONS);
const dataset = fc.constantFrom(...DATASETS);
const COMMANDS = [
  fc.tuple(user, group).map(([u, g]) => new AddMember(u, g)),
  fc.tuple(user, group).map(([u, g]) => new RemoveMember(u, g)),
  fc.tuple(user, group).map(([u, g]) => new Promote(u, g)),
  fc.tuple(user, group).map(([u, g]) => new Demote(u, g)),
  group.map((g) => new ArchiveGroup(g)),
  group.map((g) => new UnarchiveGroup(g)),
  collection.map((c) => new ArchiveCollection(c)),
  collection.map((c) => new UnarchiveCollection(c)),
  fc.tuple(collection, dataset).map(([c, d]) => new AddToCollection(c, d)),
  fc.tuple(collection, dataset).map(([c, d]) => new RemoveFromCollection(c, d)),
  fc.tuple(fc.constantFrom(...USERS, 'lab'), fc.constantFrom(...DATASETS, ...COLLECTIONS), fc.nat(5))
    .map(([s, r, pick]) => new IssueGrant(s, r, pick)),
  fc.nat(20).map((pick) => new RevokeGrant(pick)),
  group.map((g) => new ToggleContributions(g)),
  fc.tuple(group, fc.constantFrom('PUBLIC', 'AUTHENTICATED', 'PRIVATE')).map(([g, v]) => new ChangeVisibility(g, v)),
  dataset.map((d) => new SoftDeleteDataset(d)),
  user.map((u) => new SoftDeleteUser(u)),
];

let totals = {
  runs: 0, checked: 0, kinds: new Set(), refused: 0,
};

afterAll(async () => {
  await prisma.$disconnect();
});

test('every operation sequence keeps the decided effects, the invariants, and agreement', async () => {
  // eslint-disable-next-line no-console
  console.log(`operation sequences: ${RUNS} runs of up to ${MAX_COMMANDS} commands, seed ${SEED}`);
  totals = {
    runs: 0, checked: 0, kinds: new Set(), refused: 0,
  };
  await fc.assert(
    fc.asyncProperty(fc.commands(COMMANDS, { maxCommands: MAX_COMMANDS, size: 'max' }), async (commands) => {
      const real = await buildReal();
      try {
        const { world } = await snapshot(real);
        const model = {
          world, checked: 0, kinds: new Set(), refused: 0,
        };
        await verify(model, real, INITIAL_WORLD);
        await fc.asyncModelRun(_.constant({ model, real }), commands);
        totals.runs += 1;
        totals.checked += model.checked;
        model.kinds.forEach((kind) => totals.kinds.add(kind));
        totals.refused += model.refused;
      } finally {
        await cleanup(real);
      }
    }),
    { numRuns: RUNS, seed: SEED, endOnFailure: true },
  );
  // Forced unless the sequences ran commands, more than a few kinds of them, and some the
  // table refuses: a run with no refusal never reached a guard.
  // eslint-disable-next-line no-console
  console.log(`operation sequences: ${totals.checked} checks, ${totals.kinds.size} command kinds, ${totals.refused} refused`);
  expect(totals.checked).toBeGreaterThan(RUNS);
  expect(totals.kinds.size).toBeGreaterThan(5);
  expect(totals.refused).toBeGreaterThan(0);
}, 1_800_000);
