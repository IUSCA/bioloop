/**
 * Integration tests for PATCH /users/:username using the real app and test DB.
 * Each test gets fresh accounts and signed JWTs so mutations cannot leak
 * between cases. Check stored data as well as responses to detect unauthorized
 * edits or role escalation. No external login provider or dev server is used.
 */
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

async function getStoredUser(id) {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    include: { user_role: { include: { roles: true } } },
  });
}

describe('PATCH /users/:username', () => {
  let users;
  let tokens;
  let createdUserIds = [];

  beforeEach(async () => {
    users = {};
    tokens = {};
    createdUserIds = [];
    const suffix = Date.now();

    async function createAccount(label, role) {
      const username = `${label}-update${suffix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'Original Test User',
        roles: [role],
      });
      createdUserIds.push(user.id);
      users[label] = user;
      tokens[label] = issueJWT({ userProfile: get_user_profile(user) });
    }

    await createAccount('user', 'user');
    await createAccount('other', 'user');
    await createAccount('admin', 'admin');
    await createAccount('operator', 'operator');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Delete only this test's fixtures, including their user-role links.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  // A regular user can update their own name without losing their existing role.
  it('allows a user to update their own name', async () => {
    const response = await request.patch(`/users/${users.user.username}`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .send({ name: 'Updated Test User' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Updated Test User');
    expect(response.body.roles).toEqual(['user']);

    const storedUser = await getStoredUser(users.user.id);
    expect(storedUser.name).toBe('Updated Test User');
    expect(storedUser.user_role.map(({ roles }) => roles.name)).toEqual(['user']);
  });

  // Reading one's own account does not grant permission to edit another user.
  // A rejected request must leave the target's DB record and roles unchanged.
  it('rejects a user editing another account without changing stored data', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredUser(users.other.id);

    const response = await request.patch(`/users/${users.other.username}`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .send({ name: 'Unauthorized Update', roles: ['admin'] });

    expect(response.status).toBe(403);
    expect(await getStoredUser(users.other.id)).toEqual(before);
  });

  // Non-admin role changes are ignored by the current route, not rejected.
  // A 200 response must still preserve the user's role in both response and DB.
  it('prevents a user from assigning themselves the admin role', async () => {
    const response = await request.patch(`/users/${users.user.username}`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .send({ roles: ['admin'] });

    expect(response.status).toBe(200);
    expect(response.body.roles).toEqual(['user']);

    const storedUser = await getStoredUser(users.user.id);
    expect(storedUser.user_role.map(({ roles }) => roles.name)).toEqual(['user']);
  });

  // Operators can edit a regular user's details but cannot grant admin access.
  // Verify the permitted name change succeeds while the role stays unchanged.
  it('allows operator edits without granting the requested admin role', async () => {
    const response = await request.patch(`/users/${users.user.username}`)
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ name: 'Operator Updated User', roles: ['admin'] });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Operator Updated User');
    expect(response.body.roles).toEqual(['user']);

    const storedUser = await getStoredUser(users.user.id);
    expect(storedUser.name).toBe('Operator Updated User');
    expect(storedUser.user_role.map(({ roles }) => roles.name)).toEqual(['user']);
  });

  // Admins are allowed to change another user's roles; verify actual persistence.
  it('allows an admin to change another user role', async () => {
    const response = await request.patch(`/users/${users.user.username}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ roles: ['admin'] });

    expect(response.status).toBe(200);
    expect(response.body.roles).toEqual(['admin']);

    const storedUser = await getStoredUser(users.user.id);
    expect(storedUser.user_role.map(({ roles }) => roles.name)).toEqual(['admin']);
  });
});
