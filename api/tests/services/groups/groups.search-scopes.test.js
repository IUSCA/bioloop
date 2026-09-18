/**
 * groups.search-scopes.test.js
 *
 * `POST /groups/search` takes a scope, and every group selector in the UI is a scope. Three of
 * them are facts about the caller's own membership rows. Three ask what the caller may reach,
 * which is why a platform admin goes through `searchAllGroups` and everyone else through
 * `searchGroupsForUser`.
 *
 * The world below is one branch — centre > lab > sub-lab — with the actor an admin of the lab
 * only, plus two groups they have no relationship with: one private, one published.
 *
 * @see docs/design/groups/access-model.md — What each search scope shows
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const { GROUP_MEMBER_ROLE } = require('@prisma/client');

const prisma = require('@/db');
const groupsService = require('@/services/groups');
const { AUTHENTICATED_USERS_GROUP_ID, PUBLIC_GROUP_ID } = require('@/constants');
const {
  createTestUser, createTestGroup, createTestChildGroup, deleteGroup, deleteUser,
} = require('../helpers');

let actor;
let centre;
let lab;
let subLab;
let stranger; // no relationship, profile PRIVATE
let published; // no relationship, profile AUTHENTICATED

const groupsToDelete = [];

/** Cleanup runs deepest first, because group.parent_id is ON DELETE RESTRICT. */
function track(group) {
  groupsToDelete.unshift(group.id);
  return group;
}

const search = (scope, extra = {}) => groupsService.searchGroupsForUser({
  user_id: actor.subject_id,
  sort_by: 'name',
  sort_order: 'asc',
  limit: 100,
  offset: 0,
  scope,
  ...extra,
});

const namesOf = (result) => result.data.map((g) => g.name).sort();

beforeAll(async () => {
  actor = await createTestUser('_scope_actor');

  centre = track(await createTestGroup(actor.subject_id, '_scope_centre'));
  lab = track(await createTestChildGroup(centre.id, actor.subject_id, '_scope_lab'));
  subLab = track(await createTestChildGroup(lab.id, actor.subject_id, '_scope_sublab'));

  // createTestGroup does not make the actor an admin, so the row goes in by hand. Admin of the
  // lab only: that is what makes the centre reachable upward and the sub-lab overseen downward.
  await prisma.group_user.create({
    data: { group_id: lab.id, user_id: actor.subject_id, role: GROUP_MEMBER_ROLE.ADMIN },
  });

  stranger = track(await createTestGroup(actor.subject_id, '_scope_stranger'));
  published = track(await createTestGroup(actor.subject_id, '_scope_published'));
  await prisma.group.update({
    where: { id: published.id },
    data: { profile_visibility: 'AUTHENTICATED' },
  });
}, 30_000);

afterAll(async () => {
  for (const id of groupsToDelete) await deleteGroup(id).catch(() => {});
  await deleteUser(actor.id);
  await prisma.$disconnect();
}, 30_000);

describe('the three scopes that read the caller\'s own membership rows', () => {
  test('member_of is the groups holding a membership row for them', async () => {
    expect(namesOf(await search('member_of'))).toEqual([lab.name]);
  });

  test('administered is the groups holding an admin row for them', async () => {
    expect(namesOf(await search('administered'))).toEqual([lab.name]);
  });

  test('overseen is what sits strictly below a group they administer', async () => {
    // The lab itself is not overseen. Oversight falls, and it starts one level down.
    expect(namesOf(await search('overseen'))).toEqual([subLab.name]);
  });
});

describe('the three scopes that ask what the caller may reach', () => {
  test('visible is every access path, so it reaches the centre above and the sub-lab below', async () => {
    expect(namesOf(await search('visible'))).toEqual([centre.name, subLab.name, lab.name].sort());
  });

  test('can_administer is the same list as administered for anyone but a platform admin', async () => {
    expect(namesOf(await search('can_administer'))).toEqual(namesOf(await search('administered')));
  });

  test('discoverable adds a group that published its profile, and not a private one', async () => {
    const names = namesOf(await search('discoverable'));

    expect(names).toContain(published.name);
    expect(names).not.toContain(stranger.name);
    // Everything visible is still there; discoverability widens rather than replaces.
    expect(names).toEqual(expect.arrayContaining([centre.name, lab.name, subLab.name]));
  });
});

describe('the exact identifier reaches a group nothing else offers', () => {
  test('a private group is absent from discoverable until its slug is given', async () => {
    expect(namesOf(await search('discoverable'))).not.toContain(stranger.name);

    const bySlug = await search('discoverable', { search_term: stranger.slug });
    expect(namesOf(bySlug)).toEqual([stranger.name]);
  });

  test('the id works the same way, which is the form the route passes through', async () => {
    const byId = await search('discoverable', { group_id: stranger.id });
    expect(namesOf(byId)).toEqual([stranger.name]);
  });

  test('a partial slug is not an identifier, so it opens nothing', async () => {
    // The match is exact on purpose. A pattern would turn the lookup into a way to enumerate
    // private groups a character at a time.
    const partial = await search('discoverable', { search_term: stranger.slug.slice(0, -2) });
    expect(namesOf(partial)).not.toContain(stranger.name);
  });

  test('visible ignores the identifier, because it is not a discovery scope', async () => {
    const byId = await search('visible', { group_id: stranger.id });
    expect(byId.data).toEqual([]);
  });
});

describe('every row carries where the group sits', () => {
  test('ancestors come back root first, with depth', async () => {
    const { data } = await search('visible');
    const row = data.find((g) => g.id === subLab.id);

    expect(row.ancestors.map((a) => a.name)).toEqual([centre.name, lab.name]);
    expect(row.ancestors.map((a) => a.depth)).toEqual([2, 1]);
    expect(row.ancestors[0]).toHaveProperty('slug');
  });

  test('a root group has an empty ancestor list rather than a missing one', async () => {
    const { data } = await search('visible');
    expect(data.find((g) => g.id === centre.id).ancestors).toEqual([]);
  });
});

describe('the system principals are never rows', () => {
  test.each(groupsService.SEARCH_SCOPES)('%s excludes them', async (scope) => {
    const ids = (await search(scope, { limit: 100 })).data.map((g) => g.id);

    expect(ids).not.toContain(AUTHENTICATED_USERS_GROUP_ID);
    expect(ids).not.toContain(PUBLIC_GROUP_ID);
  });
});

describe('an unknown scope is refused rather than answered', () => {
  // The clause is built by comparing against known names, so a name that matches none of them
  // left the filter empty — every group in the database, not none. Renaming the scopes is what
  // surfaced it, and this is what stops the next rename doing the same.
  test.each(['all', 'direct', 'oversight', 'admin', '', 'ADMINISTERED'])(
    '%p is a 400, not a full listing',
    async (scope) => {
      await expect(search(scope)).rejects.toMatchObject({ status: 400 });
    },
  );

  test('the same refusal guards the platform admin query', async () => {
    await expect(groupsService.searchAllGroups({
      user_id: actor.subject_id, sort_by: 'name', sort_order: 'asc', limit: 10, offset: 0, scope: 'all',
    })).rejects.toMatchObject({ status: 400 });
  });
});

describe('the platform admin query', () => {
  const searchAll = (scope) => groupsService.searchAllGroups({
    user_id: actor.subject_id,
    sort_by: 'name',
    sort_order: 'asc',
    limit: 200,
    offset: 0,
    scope,
  });

  test.each(['visible', 'can_administer', 'discoverable'])(
    '%s reaches a group the caller has no relationship with',
    async (scope) => {
      expect(namesOf(await searchAll(scope))).toContain(stranger.name);
    },
  );

  test('administered stays their own admin rows, so My Groups is still honest', async () => {
    const names = namesOf(await searchAll('administered'));

    expect(names).toEqual([lab.name]);
    expect(names).not.toContain(stranger.name);
  });

  test('its rows carry ancestors too', async () => {
    const { data } = await searchAll('visible');
    const row = data.find((g) => g.id === subLab.id);

    expect(row.ancestors.map((a) => a.name)).toEqual([centre.name, lab.name]);
  });
});
