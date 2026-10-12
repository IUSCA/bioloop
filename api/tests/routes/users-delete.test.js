/**
 * Integration tests for DELETE /users/:username using the real app and test DB.
 * Fresh accounts and signed JWTs isolate each case. Verify stored user records
 * and role links, not only HTTP responses, for soft deletion, hard deletion,
 * denied requests and invalid input. No dev server or external login is used.
 */
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

async function getStoredUser(id) {
  return prisma.user.findUnique({
    where: { id },
    include: { user_role: { include: { roles: true } } },
  });
}

describe('DELETE /users/:username', () => {
  let users;
  let tokens;
  let createdUserIds = [];

  beforeEach(async () => {
    users = {};
    tokens = {};
    createdUserIds = [];
    const suffix = Date.now();

    async function createAccount(label, role) {
      const username = `${label}-delete${suffix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Delete Test User',
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
    // Delete only this test's fixtures; already hard-deleted records are safe.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  // Authentication is required even when the request asks for hard deletion.
  // A 401 response must leave the account and its role links unchanged.
  it('rejects deletion without a token and preserves stored data', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredUser(users.other.id);

    const response = await request.delete(`/users/${users.other.username}`)
      .query({ hard_delete: true });

    expect(response.status).toBe(401);
    expect(await getStoredUser(users.other.id)).toEqual(before);
  });

  // Neither user nor operator may delete their own or another account.
  // Run each ownership case for both modes to guard against hard-delete bypasses.
  it.each([
    ['user', 'user', false],
    ['user', 'other', false],
    ['operator', 'operator', false],
    ['operator', 'other', false],
    ['user', 'user', true],
    ['user', 'other', true],
    ['operator', 'operator', true],
    ['operator', 'other', true],
  ])('rejects %s deleting %s with hard_delete=%s', async (role, target, hardDelete) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredUser(users[target].id);

    const response = await request.delete(`/users/${users[target].username}`)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .query({ hard_delete: hardDelete });

    expect(response.status).toBe(403);
    expect(await getStoredUser(users[target].id)).toEqual(before);
  });

  // Explicit false selects soft deletion: mark the account without removing it.
  // Existing identity details and role links must remain in the database.
  it('allows an admin to soft-delete a user while preserving their role links', async () => {
    const before = await getStoredUser(users.other.id);
    expect(before.is_deleted).toBe(false);
    expect(before.user_role).toHaveLength(1);

    const response = await request.delete(`/users/${users.other.username}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .query({ hard_delete: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: users.other.id,
      username: users.other.username,
      is_deleted: true,
      roles: ['user'],
    }));

    const storedUser = await getStoredUser(users.other.id);
    expect(storedUser).toEqual(expect.objectContaining({
      id: before.id,
      username: before.username,
      email: before.email,
      is_deleted: true,
    }));
    expect(storedUser.user_role).toEqual(before.user_role);
  });

  // Explicit true selects hard deletion: remove the account and its role links.
  // Check actual DB removal rather than trusting the success message alone.
  it('allows an admin to hard-delete a user and remove their role links', async () => {
    const before = await getStoredUser(users.other.id);
    expect(before).not.toBeNull();
    expect(before.user_role).toHaveLength(1);

    const response = await request.delete(`/users/${users.other.username}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .query({ hard_delete: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: users.other.id,
      username: users.other.username,
    });
    expect(await getStoredUser(users.other.id)).toBeNull();
    expect(await prisma.user_role.count({ where: { user_id: users.other.id } })).toBe(0);
  });

  // Use an admin token so this reaches query validation, not a permission error.
  // Invalid mode input must return 400 without deleting or modifying the user.
  it('rejects an invalid hard_delete value and preserves stored data', async () => {
    const before = await getStoredUser(users.other.id);

    const response = await request.delete(`/users/${users.other.username}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .query({ hard_delete: 'invalid' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'hard_delete', location: 'query' }),
    ]));
    expect(await getStoredUser(users.other.id)).toEqual(before);
  });
});
