/**
 * Project-read integration tests using the real app and isolated PostgreSQL.
 * Regular users use /projects/:username/:id and must be associated with the
 * project. Admin/operator can use /projects/:id without an association.
 * Check ID and slug lookup, ownership-independent membership, role filtering
 * and denied access. Dataset fixtures have no workflows, so no external
 * workflow server or developer API is needed. Mutation routes are not covered.
 */
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

const users = {};
const tokens = {};
const projects = {};
const datasets = {};
const createdUserIds = [];
const createdProjectIds = [];
const createdDatasetIds = [];

function expectProject(response, project, dataset) {
  expect(response.status).toBe(200);
  expect(response.body).toEqual(expect.objectContaining({
    id: project.id,
    slug: project.slug,
    name: project.name,
    owner_id: project.owner_id,
  }));
  // An unrelated project's dataset must never appear in this response.
  expect(response.body.datasets.map((association) => association.dataset.id)).toEqual([dataset.id]);
}

describe('Project read permissions', () => {
  beforeAll(async () => {
    const suffix = Date.now();

    async function createAccount(label, role) {
      const username = `${label}-project-read${suffix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Project Read Test User',
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

    async function createProject(label, owner, members) {
      const name = `${label}-project-read${suffix}`;
      const dataset = await prisma.dataset.create({
        data: { name: `${label}-dataset-read${suffix}`, type: 'raw' },
      });
      createdDatasetIds.push(dataset.id);
      datasets[label] = dataset;

      // Build fixtures directly so these reads do not rely on untested create
      // endpoints. owner_id and project_user membership are separate fields.
      const project = await prisma.project.create({
        data: {
          name,
          slug: name,
          owner_id: owner.id,
          users: { create: members.map((user) => ({ user_id: user.id })) },
          datasets: { create: { dataset_id: dataset.id } },
        },
      });
      createdProjectIds.push(project.id);
      projects[label] = project;
    }

    await createProject('shared', users.owner, [users.owner, users.member]);
    await createProject('unrelated', users.outsider, [users.outsider]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Remove only these fixtures. Project deletion first removes membership
    // and dataset associations before deleting the accounts and datasets.
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.dataset.deleteMany({ where: { id: { in: createdDatasetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  // Even a real project and associated username require a valid login token.
  it('rejects project lookup without authentication', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/projects/${users.owner.username}/${projects.shared.id}`);

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('datasets');
  });

  // Association grants access to both owner and non-owner members. Run ID and
  // slug lookup for each. Regular users must not receive the project's users.
  it.each([
    ['owner', 'id'],
    ['owner', 'slug'],
    ['member', 'id'],
    ['member', 'slug'],
  ])('allows associated %s to read a project by %s', async (label, identifier) => {
    const response = await request.get(`/projects/${users[label].username}/${projects.shared[identifier]}`)
      .set('Authorization', `Bearer ${tokens[label]}`);

    expectProject(response, projects.shared, datasets.shared);
    expect(response.body).not.toHaveProperty('users');
  });

  // The outsider belongs to a different project. Using their own username
  // must return 404 for this project rather than exposing its dataset.
  it('does not expose a project to an unrelated user using their own username', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await prisma.project_user.count({
      where: { project_id: projects.shared.id, user_id: users.outsider.id },
    })).toBe(0);

    const response = await request.get(`/projects/${users.outsider.username}/${projects.shared.id}`)
      .set('Authorization', `Bearer ${tokens.outsider}`);

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('datasets');
    expect(response.body).not.toHaveProperty('id');
  });

  // An unrelated user cannot bypass membership by substituting the owner's
  // username in the URL. The token identity must control permission checks.
  it('rejects an unrelated user impersonating the owner in the URL', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/projects/${users.owner.username}/${projects.shared.id}`)
      .set('Authorization', `Bearer ${tokens.outsider}`);

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('datasets');
    expect(response.body).not.toHaveProperty('users');
  });

  // The unrestricted route is for admin/operator only. Owning and belonging
  // to the project does not grant a regular user read:any permission.
  it('rejects a regular owner using the unrestricted project route', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/projects/${projects.shared.id}`)
      .set('Authorization', `Bearer ${tokens.owner}`);

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('datasets');
  });

  // Admin and operator may read any project by either identifier without
  // membership. Privileged responses include the associated account details.
  it.each([
    ['admin', 'id'],
    ['admin', 'slug'],
    ['operator', 'id'],
    ['operator', 'slug'],
  ])('allows unassociated %s to read a project by %s', async (role, identifier) => {
    expect(await prisma.project_user.count({
      where: { project_id: projects.shared.id, user_id: users[role].id },
    })).toBe(0);

    const response = await request.get(`/projects/${projects.shared[identifier]}`)
      .set('Authorization', `Bearer ${tokens[role]}`);

    expectProject(response, projects.shared, datasets.shared);
    expect(response.body.users.map((association) => association.user.username).sort()).toEqual(
      [users.owner.username, users.member.username].sort(),
    );
  });

  // Use an admin token to pass authorization and reach the actual DB lookup.
  // Missing projects must return 404 without project or dataset content.
  it('returns 404 when an admin requests a nonexistent project', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/projects/missing-project-${Date.now()}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('id');
    expect(response.body).not.toHaveProperty('datasets');
  });
});
