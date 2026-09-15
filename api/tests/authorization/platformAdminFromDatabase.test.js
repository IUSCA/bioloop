/**
 * platformAdminFromDatabase.test.js
 *
 * The engine decides platform admin from user_role on every request, never from the session.
 *
 * Routes seed the policy context with the JWT profile and pass it as the pre-fetched user, and
 * that profile carries the roles the user held at login. A user whose admin role was removed
 * after login kept every action until the token expired. The platform-admin term now requires
 * `current_roles`, which no profile carries, so the hydrator reads it from the database.
 *
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 14
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { authorizeAction } = require('@/authorization');
const { PrismaHydrator } = require('@/authorization/core/hydrators/PrismaHydrator');
const { createTestUser, deleteUser } = require('../services/helpers');

let formerAdmin;
let currentAdmin;

const freshContext = () => ({ cache: { user: new Map(), resource: new Map(), context: new Map() } });

/** `audit.read_records` is reachable only through the platform-admin short-circuit. */
const readRecords = (user, { preFetchedRoles, seededRoles } = {}) => {
  const context = freshContext();
  if (seededRoles) {
    context.cache.user.set(
      PrismaHydrator.cacheKey('user', user.subject_id),
      { subject_id: user.subject_id, roles: seededRoles },
    );
  }
  return authorizeAction('audit', 'read_records', {
    identifiers: { user: user.subject_id, resource: null },
    policyExecutionContext: context,
    preFetched: preFetchedRoles ? { user: { subject_id: user.subject_id, roles: preFetchedRoles } } : undefined,
  });
};

beforeAll(async () => {
  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: 'admin' } });
  formerAdmin = await createTestUser('_former_admin');
  currentAdmin = await createTestUser('_current_admin');
  await prisma.user_role.create({ data: { user_id: currentAdmin.id, role_id: adminRole.id } });
});

afterAll(async () => {
  await prisma.user_role.deleteMany({ where: { user_id: { in: [formerAdmin.id, currentAdmin.id] } } });
  await deleteUser(formerAdmin.id);
  await deleteUser(currentAdmin.id);
  await prisma.$disconnect();
});

describe('a session that still claims admin', () => {
  test('is refused when the pre-fetched user carries the stale role', async () => {
    const result = await readRecords(formerAdmin, { preFetchedRoles: ['admin'] });
    expect(result.granted).toBe(false);
  });

  test('is refused when the policy context was seeded with the stale role', async () => {
    const result = await readRecords(formerAdmin, { seededRoles: ['admin'] });
    expect(result.granted).toBe(false);
  });
});

describe('an admin whose session predates the role', () => {
  test('is allowed although the pre-fetched user carries no role', async () => {
    const result = await readRecords(currentAdmin, { preFetchedRoles: [] });
    expect(result.granted).toBe(true);
  });

  test('is allowed although the policy context was seeded with no role', async () => {
    const result = await readRecords(currentAdmin, { seededRoles: [] });
    expect(result.granted).toBe(true);
  });
});
