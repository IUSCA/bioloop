/**
 * platformAdminShortCircuit.test.js
 *
 * A platform admin is allowed every action by one check in the engine, and no action
 * policy names the role.
 *
 * @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction, policyRegistry } = require('@/authorization');
const restrictionsService = require('@/services/restrictions');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../services/helpers');

const RESOURCE_TYPES = ['dataset', 'collection', 'group', 'grant', 'user', 'access_request', 'audit'];

let admin;
let outsider;
let group;
let dataset;

const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  admin = await createTestUser('_admin_check_admin');
  // createTestUser does not assign roles, and the user hydrator reads them from user_role.
  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  await prisma.user_role.create({ data: { user_id: admin.id, role_id: adminRole.id } });
  outsider = await createTestUser('_admin_check_outsider');
  usersToDelete.push(admin.id, outsider.id);
  group = await createTestGroup(outsider.subject_id, '_admin_check_group');
  groupsToDelete.push(group.id);
  dataset = await createTestDataset(group.id, '_admin_check_ds');
  datasetsToDelete.push(dataset.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) {
    await prisma.grant.deleteMany({ where: { resource: { dataset: { id } } } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

describe('no built-in policy names the platform-admin role', () => {
  test.each(RESOURCE_TYPES)('%s policies do not reference isPlatformAdmin', (resourceType) => {
    const container = policyRegistry.get(resourceType);

    // Policies are renamed on registration to `<resourceType>.<action>`, so the name of a
    // composed policy carries the names of its parts. A policy still naming the role shows
    // up here without needing to reach inside the combinator.
    const exported = JSON.stringify(container.export());
    expect(exported).not.toMatch(/isPlatformAdmin/);
  });

  test('the role is checked exactly once, in the engine', () => {
    // If this file count grows, a hand-written role check has crept back in.
    // eslint-disable-next-line global-require
    const { isPlatformAdmin } = require('@/authorization/builtin/policies/utils/index');
    expect(isPlatformAdmin.name).toBe('isPlatformAdmin');
  });
});

describe('a platform admin is allowed every action', () => {
  test('every dataset action is granted without a grant or a membership', async () => {
    const actions = policyRegistry.get('dataset').getActionNames();
    expect(actions.length).toBeGreaterThan(10);

    for (const action of actions) {
      // eslint-disable-next-line no-await-in-loop
      const result = await authorizeAction('dataset', action, {
        identifiers: { user: admin.subject_id, resource: dataset.resource_id },
      });
      expect([action, result.granted]).toEqual([action, true]);
    }
  }, 30_000);

  test('capabilities come back all true', async () => {
    const result = await authorizeAction('dataset', 'view_metadata', {
      identifiers: { user: admin.subject_id, resource: dataset.resource_id },
      shouldDeriveCapabilities: true,
    });

    const values = Object.values(result.capabilities);
    expect(values.length).toBeGreaterThan(10);
    expect(values.every((v) => v === true)).toBe(true);
  });

  test('the caller role is PLATFORM_ADMIN', async () => {
    const result = await authorizeAction('dataset', 'view_metadata', {
      identifiers: { user: admin.subject_id, resource: dataset.resource_id },
      shouldDeriveStanding: true,
    });

    expect(result.standing[0]).toEqual({ kind: 'platform_admin' });
  });

  test('no attribute is filtered out', async () => {
    const result = await authorizeAction('dataset', 'view_metadata', {
      identifiers: { user: admin.subject_id, resource: dataset.resource_id },
    });

    // origin_path is withheld from everyone but the owning group's admins.
    const filtered = result.filter({ id: dataset.id, origin_path: '/some/path' });
    expect(filtered.origin_path).toBe('/some/path');
  });
});

describe('a non-admin is unaffected', () => {
  test('an outsider is still refused', async () => {
    const result = await authorizeAction('dataset', 'view_metadata', {
      identifiers: { user: outsider.subject_id, resource: dataset.resource_id },
    });

    expect(result.granted).toBe(false);
  });

  test('an action only an admin can reach refuses everyone else', async () => {
    const result = await authorizeAction('dataset', 'edit', {
      identifiers: { user: outsider.subject_id, resource: dataset.resource_id },
    });

    expect(result.granted).toBe(false);
  });
});

describe('a restriction still blocks a platform admin', () => {
  test('an archived dataset refuses a mutation, and the reason names the restriction', async () => {
    await restrictionsService.applyRestriction(prisma, {
      type_name: 'ARCHIVED',
      group_id: group.id,
      actor_id: admin.subject_id,
    });

    try {
      const result = await authorizeAction('dataset', 'edit_metadata', {
        identifiers: { user: admin.subject_id, resource: dataset.resource_id },
      });

      // The short-circuit runs after the restriction check on purpose.
      expect(result.granted).toBe(false);
      expect(result.blockedBy).toBe('ARCHIVED');
    } finally {
      await restrictionsService.liftRestriction(prisma, {
        type_name: 'ARCHIVED',
        group_id: group.id,
        actor_id: admin.subject_id,
      });
    }
  }, 30_000);
});
