/**
 * Integration tests for GET /users/:username against the real Express app.
 * Test accounts live in the isolated database, and requests use signed JWTs.
 * These checks cover route wiring, authentication, permissions and DB lookup;
 * they do not contact an external login provider or the developer's API server.
 * Missing and soft-deleted accounts must return 404, even to an admin.
 */
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

const users = {};
const tokens = {};
const createdUserIds = [];

describe('GET /users/:username', () => {
  beforeAll(async () => {
    const suffix = Date.now();

    async function createAccount(label, role) {
      const username = `${label}-read${suffix}`;
      // Use the real user service so each profile reflects its stored DB role.
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Test User',
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
    await createAccount('deleted', 'user');
    await userService.softDeleteUser(users.deleted.username);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Only remove accounts created by this suite, not shared seed accounts.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  // Requests without an authentication token must be rejected with 401.
  it('rejects a request without a token', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/users/${users.user.username}`);

    expect(response.status).toBe(401);
  });

  // A regular user can read their own account with a 200 response.
  // Verify that the returned ID, username, email and roles match the DB fixture.
  it('allows a user to read their own account', async () => {
    const response = await request.get(`/users/${users.user.username}`)
      .set('Authorization', `Bearer ${tokens.user}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: users.user.id,
      username: users.user.username,
      email: users.user.email,
      roles: ['user'],
    }));
  });

  // Authentication alone does not permit a regular user to read another account.
  // The permission check must reject this request with 403.
  it('rejects a user reading another account', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/users/${users.other.username}`)
      .set('Authorization', `Bearer ${tokens.user}`);

    expect(response.status).toBe(403);
  });

  // Run once for admin and once for operator: both can read another account.
  // Verify the 200 response contains the requested account's stored details.
  it.each(['admin', 'operator'])('allows %s to read another account', async (role) => {
    const response = await request.get(`/users/${users.other.username}`)
      .set('Authorization', `Bearer ${tokens[role]}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: users.other.id,
      username: users.other.username,
      email: users.other.email,
      roles: ['user'],
    }));
  });

  // Use an admin token to pass authentication and permission checks.
  // A username absent from the DB must return 404, not 401 or 403.
  it('returns 404 for an account that does not exist', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const username = `missing-${Date.now()}`;
    const storedUser = await prisma.user.findUnique({ where: { username } });
    expect(storedUser).toBeNull();

    const response = await request.get(`/users/${username}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(response.status).toBe(404);
  });

  // A record marked is_deleted must be excluded from account lookup.
  // Even an admin must receive 404 without the deleted account's email.
  it('returns 404 for a soft-deleted account', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // The record still exists in the DB, but it must not be returned by the API.
    const storedUser = await prisma.user.findUnique({ where: { id: users.deleted.id } });
    expect(storedUser).toEqual(expect.objectContaining({ is_deleted: true }));

    const response = await request.get(`/users/${users.deleted.username}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('email');
  });
});
