/**
 * Integration tests for POST /users using the real app and isolated test DB.
 * Check role-based creation, default roles, operator role filtering and input
 * validation. Verify stored account details and role links as well as responses.
 * Fresh fixtures keep cases independent; no dev server or external login is used.
 */
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

async function expectCreatedUser(response, payload, expectedRoles) {
  expect(response.status).toBe(200);
  expect(response.body).toEqual(expect.objectContaining({
    id: expect.any(Number),
    username: payload.username,
    email: payload.email,
    name: payload.name,
    is_deleted: false,
  }));
  expect(response.body.roles.slice().sort()).toEqual(expectedRoles.slice().sort());

  const storedUser = await prisma.user.findUniqueOrThrow({
    where: { username: payload.username },
    include: { user_role: { include: { roles: true } } },
  });

  expect(storedUser).toEqual(expect.objectContaining({
    id: response.body.id,
    username: payload.username,
    email: payload.email,
    name: payload.name,
    is_deleted: false,
  }));
  const storedRoles = storedUser.user_role.map(({ roles }) => roles.name).sort();
  expect(storedRoles).toEqual(expectedRoles.slice().sort());
}

describe('POST /users', () => {
  let tokens;
  let payload;
  let createdUsernames = [];

  beforeEach(async () => {
    tokens = {};
    createdUsernames = [];
    const suffix = Date.now();

    async function createAccount(role) {
      const username = `${role}-create${suffix}`;
      createdUsernames.push(username);
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Create Test Actor',
        roles: [role],
      });
      tokens[role] = issueJWT({ userProfile: get_user_profile(user) });
    }

    await createAccount('user');
    await createAccount('admin');
    await createAccount('operator');

    const username = `new-user-create${suffix}`;
    payload = {
      username,
      email: `${username}@example.com`,
      name: 'API Created Test User',
    };
    createdUsernames.push(username);
    expect(await prisma.user.findUnique({ where: { username } })).toBeNull();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Remove only this test's actors and requested accounts, even if a rejected
    // request unexpectedly created one. Never remove shared seed accounts.
    await prisma.user.deleteMany({ where: { username: { in: createdUsernames } } });
  });

  // Creating an account requires authentication. Check both the 401 response
  // and unchanged account/role counts to detect writes before rejection.
  it('rejects creation without a token and does not write to the database', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const userCount = await prisma.user.count();
    const roleLinkCount = await prisma.user_role.count();

    const response = await request.post('/users').send(payload);

    expect(response.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { username: payload.username } })).toBeNull();
    expect(await prisma.user.count()).toBe(userCount);
    expect(await prisma.user_role.count()).toBe(roleLinkCount);
  });

  // A regular user may not create accounts, including ones requesting admin.
  // A denied request must not insert either an account or a user-role link.
  it('rejects creation by a user and does not write to the database', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const userCount = await prisma.user.count();
    const roleLinkCount = await prisma.user_role.count();

    const response = await request.post('/users')
      .set('Authorization', `Bearer ${tokens.user}`)
      .send({ ...payload, roles: ['admin'] });

    expect(response.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { username: payload.username } })).toBeNull();
    expect(await prisma.user.count()).toBe(userCount);
    expect(await prisma.user_role.count()).toBe(roleLinkCount);
  });

  // Admins may explicitly assign each supported role to a newly created user.
  // Verify the assigned role is present in both the response and database.
  it.each(['user', 'operator', 'admin'])('allows an admin to create an account with %s role', async (role) => {
    const response = await request.post('/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ ...payload, roles: [role] });

    await expectCreatedUser(response, payload, [role]);
  });

  // Both allowed creators get a user-role default when roles are omitted.
  // Defaults must be stored, not merely added to the returned profile.
  it.each(['admin', 'operator'])('defaults to user role when %s omits roles', async (role) => {
    const response = await request.post('/users')
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(payload);

    await expectCreatedUser(response, payload, ['user']);
  });

  // Operators can create accounts but their supplied roles must be ignored.
  // Test each privileged role and a mixed list: all must produce only user.
  it.each([
    ['admin', ['admin']],
    ['operator', ['operator']],
    ['mixed roles', ['user', 'operator', 'admin']],
  ])('prevents an operator from assigning %s during creation', async (_label, roles) => {
    const response = await request.post('/users')
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({ ...payload, roles });

    await expectCreatedUser(response, payload, ['user']);
  });

  // Admin authentication allows these requests to reach input validation.
  // JSON omits undefined email; each bad input must fail before any DB writes.
  it.each([
    ['invalid email', { email: 'invalid' }, 'email'],
    ['missing email', { email: undefined }, 'email'],
    ['long username', { username: 'u'.repeat(101) }, 'username'],
  ])('rejects %s without creating an account', async (_label, overrides, field) => {
    const invalidPayload = { ...payload, ...overrides };
    createdUsernames.push(invalidPayload.username);
    const userCount = await prisma.user.count();
    const roleLinkCount = await prisma.user_role.count();

    const response = await request.post('/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: field, location: 'body' }),
    ]));
    expect(await prisma.user.findUnique({
      where: { username: invalidPayload.username },
    })).toBeNull();
    expect(await prisma.user.count()).toBe(userCount);
    expect(await prisma.user_role.count()).toBe(roleLinkCount);
  });
});
