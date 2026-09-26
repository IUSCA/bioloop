/**
 * Integration tests for PATCH /projects/:id using the real app and test DB.
 * The existing access-control policy allows only admin/operator to update
 * projects. Regular owners, members and unrelated users must all be denied.
 * Verify persisted data and associations as well as status codes. Each case
 * gets fresh fixtures; no developer DB, server or external workflow is used.
 */
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

// Temporarily excluded at the user's request pending manager confirmation of
// project update permissions. The known authorization gap is not fixed.
// Restore describe after policy confirmation; do not weaken the assertions.
describe.skip('PATCH /projects/:id', () => {
  let users;
  let tokens;
  let project;
  let createdUserIds = [];
  let createdProjectIds = [];
  let createdDatasetIds = [];

  async function getStoredProject() {
    return prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: {
        users: { orderBy: { user_id: 'asc' } },
        datasets: { orderBy: { dataset_id: 'asc' } },
      },
    });
  }

  beforeEach(async () => {
    users = {};
    tokens = {};
    createdUserIds = [];
    createdProjectIds = [];
    createdDatasetIds = [];
    const suffix = Date.now();

    async function createAccount(label, role) {
      const username = `${label}-project-update${suffix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Project Update Test User',
        roles: [role],
      });
      createdUserIds.push(user.id);
      users[label] = user;
      tokens[label] = issueJWT({ userProfile: get_user_profile(user) });
    }

    await createAccount('owner', 'user');
    await createAccount('member', 'user');
    await createAccount('outsider', 'user');
    await createAccount('admin', 'admin');
    await createAccount('operator', 'operator');

    const dataset = await prisma.dataset.create({
      data: { name: `dataset-project-update${suffix}`, type: 'raw' },
    });
    createdDatasetIds.push(dataset.id);

    const name = `shared-project-update${suffix}`;
    project = await prisma.project.create({
      data: {
        name,
        slug: name,
        description: 'Original Project Description',
        browser_enabled: false,
        metadata: { study: 'original' },
        owner_id: users.owner.id,
        users: {
          create: [users.owner, users.member].map((user) => ({ user_id: user.id })),
        },
        datasets: { create: { dataset_id: dataset.id } },
      },
    });
    createdProjectIds.push(project.id);

    // Owning a different project must not grant access to this target project.
    const unrelated = await prisma.project.create({
      data: {
        name: `unrelated-project-update${suffix}`,
        slug: `unrelated-project-update${suffix}`,
        owner_id: users.outsider.id,
        users: { create: { user_id: users.outsider.id } },
      },
    });
    createdProjectIds.push(unrelated.id);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Cleanup runs even after a failed regression assertion and only removes
    // this case's records. Project deletion also removes its associations.
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.dataset.deleteMany({ where: { id: { in: createdDatasetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  // Authentication must reject the request before any project data changes.
  it('rejects updates without a token and preserves the project', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredProject();

    const response = await request.patch(`/projects/${project.id}`)
      .send({ description: 'Unauthorized Project Update' });

    expect({ status: response.status, project: await getStoredProject() }).toEqual({
      status: 401,
      project: before,
    });
  });

  // The policy does not grant project update permission to the user role,
  // even for the owner or a member. Compare both status and stored data so a
  // missing permission check is caught even if the response looks successful.
  it.each(['owner', 'member', 'outsider'])('rejects a regular %s updating a project', async (label) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredProject();

    const response = await request.patch(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${tokens[label]}`)
      .send({ description: 'Unauthorized Project Update', browser_enabled: true });

    expect({ status: response.status, project: await getStoredProject() }).toEqual({
      status: 403,
      project: before,
    });
  });

  // Admin/operator may update project details without membership. Check the
  // allowed changes persist while identity, metadata and links stay intact.
  it.each(['admin', 'operator'])('allows an unassociated %s to update a project', async (role) => {
    const before = await getStoredProject();
    expect(await prisma.project_user.count({
      where: { project_id: project.id, user_id: users[role].id },
    })).toBe(0);

    const updates = { description: 'Updated Project Description', browser_enabled: true };
    const response = await request.patch(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(updates);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ id: project.id, ...updates }));
    expect(await getStoredProject()).toEqual({
      ...before,
      ...updates,
      updated_at: expect.any(Date),
    });
  });

  // Privileged callers pass authorization but still need a real project.
  // A missing project must return 404 and leave the existing fixture unchanged.
  it.each(['admin', 'operator'])('returns 404 when %s updates a nonexistent project', async (role) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredProject();

    const response = await request.patch(`/projects/missing-project-update${Date.now()}`)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send({ description: 'Updated Project Description' });

    expect(response.status).toBe(404);
    expect(await getStoredProject()).toEqual(before);
  });

  // Use an admin token to reach validation. A name below the minimum length
  // must be rejected before description or any other project field is updated.
  it('rejects a short project name without changing stored data', async () => {
    const before = await getStoredProject();

    const response = await request.patch(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ name: 'tiny', description: 'Invalid Project Update' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'name', location: 'body' }),
    ]));
    expect(await getStoredProject()).toEqual(before);
  });
});
