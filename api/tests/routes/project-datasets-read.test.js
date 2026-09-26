/**
 * Integration tests for GET /projects/:username/:id/datasets with project IDs.
 * Use real membership records and signed JWTs to check member access, rejection
 * of unrelated users and privileged access without association. Compare exact
 * dataset IDs and counts so another project's data cannot leak into a response.
 * Name searches check partial, case-insensitive matches and project isolation.
 * Staging filters check both states, combined searches and role restrictions.
 * Pagination checks ordered pages and counts before take/skip are applied.
 * Invalid query values must return field errors without exposing datasets.
 * Workflow-free fixtures use only the isolated DB, not external services.
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

function expectDatasets(response, expectedDatasets, totalCount = expectedDatasets.length) {
  expect(response.status).toBe(200);
  expect(response.body.metadata.count).toBe(totalCount);
  // Compare sorted IDs to require exactly the expected datasets, including
  // no duplicates or unrelated records, regardless of the requested ordering.
  const returnedIds = response.body.datasets.map((dataset) => dataset.id).sort((a, b) => a - b);
  const expectedIds = expectedDatasets.map((dataset) => dataset.id).sort((a, b) => a - b);
  expect(returnedIds).toEqual(expectedIds);
  expect(response.body.datasets).toEqual(expect.arrayContaining(
    expectedDatasets.map((dataset) => expect.objectContaining({
      id: dataset.id,
      name: dataset.name,
      type: dataset.type,
      is_staged: dataset.is_staged,
    })),
  ));
}

function expectDatasetPage(response, expectedDatasets, totalCount) {
  expectDatasets(response, expectedDatasets, totalCount);
  // Pagination uses an explicit, unique sort field. Check the actual order,
  // not just the set of IDs, so incorrect sorting cannot pass unnoticed.
  expect(response.body.datasets.map((dataset) => dataset.id))
    .toEqual(expectedDatasets.map((dataset) => dataset.id));
}

describe('Project dataset-list', () => {
  beforeAll(async () => {
    const suffix = Date.now();

    async function createAccount(label, role) {
      const username = `${label}-project-datasets${suffix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Project Dataset Test User',
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

    async function createDataset(label, isStaged) {
      const dataset = await prisma.dataset.create({
        data: {
          name: `${label}-project-datasets${suffix}`,
          type: 'raw',
          is_staged: isStaged,
        },
      });
      createdDatasetIds.push(dataset.id);
      return dataset;
    }

    // Both projects contain staged and unstaged datasets with matching search
    // keywords, so either filter must still respect project boundaries.
    datasets.shared = [
      await createDataset('Alpha-first', true),
      await createDataset('Beta-second', false),
    ];
    datasets.unrelated = [
      await createDataset('Alpha-unrelated', true),
      await createDataset('Beta-unrelated', false),
    ];

    async function createProject(label, owner, members, projectDatasets) {
      const name = `${label}-project-datasets${suffix}`;
      const project = await prisma.project.create({
        data: {
          name,
          slug: name,
          owner_id: owner.id,
          users: { create: members.map((user) => ({ user_id: user.id })) },
          datasets: { create: projectDatasets.map((dataset) => ({ dataset_id: dataset.id })) },
        },
      });
      createdProjectIds.push(project.id);
      projects[label] = project;
    }

    await createProject('shared', users.owner, [users.owner, users.member], datasets.shared);
    await createProject('unrelated', users.outsider, [users.outsider], datasets.unrelated);
    await createProject('empty', users.member, [users.member], []);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Delete only this suite's fixtures, removing project associations first.
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.dataset.deleteMany({ where: { id: { in: createdDatasetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  // A known member username and project ID do not replace authentication.
  it('rejects dataset-list requests without a token', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/projects/${users.owner.username}/${projects.shared.id}/datasets`);

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('datasets');
  });

  // Both the owner and non-owner member may list this project's datasets.
  // Omitting staged returns both states. Exact IDs and count ensure the
  // unrelated project's datasets are excluded.
  it.each(['owner', 'member'])('allows associated %s to list only their project datasets', async (label) => {
    const response = await request.get(`/projects/${users[label].username}/${projects.shared.id}/datasets`)
      .set('Authorization', `Bearer ${tokens[label]}`);

    expectDatasets(response, datasets.shared);
  });

  // The user belongs to another project, not this one. An own-username URL
  // passes the initial role check but must still fail the membership check.
  it('rejects a non-member requesting another project datasets', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await prisma.project_user.count({
      where: { project_id: projects.shared.id, user_id: users.outsider.id },
    })).toBe(0);

    const response = await request.get(`/projects/${users.outsider.username}/${projects.shared.id}/datasets`)
      .set('Authorization', `Bearer ${tokens.outsider}`);

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('datasets');
  });

  // Owning one project must not grant permission to another project's data.
  it('rejects an owner requesting an unrelated project datasets', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/projects/${users.owner.username}/${projects.unrelated.id}/datasets`)
      .set('Authorization', `Bearer ${tokens.owner}`);

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('datasets');
  });

  // Substituting a real member's username cannot bypass the token identity.
  it('rejects a non-member using the owner username in the URL', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request.get(`/projects/${users.owner.username}/${projects.shared.id}/datasets`)
      .set('Authorization', `Bearer ${tokens.outsider}`);

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('datasets');
  });

  // Admin/operator bypass membership restrictions but must still receive
  // only the requested project's datasets, not a global dataset list.
  it.each(['admin', 'operator'])('allows unassociated %s to list project datasets', async (role) => {
    expect(await prisma.project_user.count({
      where: { project_id: projects.shared.id, user_id: users[role].id },
    })).toBe(0);

    const response = await request.get(`/projects/${users[role].username}/${projects.shared.id}/datasets`)
      .set('Authorization', `Bearer ${tokens[role]}`);

    expectDatasets(response, datasets.shared);
  });

  // The same user denied access above can still read their own project. This
  // distinguishes a membership restriction from rejecting that account entirely.
  it('allows the outsider to list datasets of their own project', async () => {
    const response = await request.get(`/projects/${users.outsider.username}/${projects.unrelated.id}/datasets`)
      .set('Authorization', `Bearer ${tokens.outsider}`);

    expectDatasets(response, datasets.unrelated);
  });

  // A real, accessible project with no datasets returns 200, count 0 and [],
  // rather than being treated as forbidden or receiving another project's data.
  it('returns an empty list for an associated project with no datasets', async () => {
    const response = await request.get(`/projects/${users.member.username}/${projects.empty.id}/datasets`)
      .set('Authorization', `Bearer ${tokens.member}`);

    expectDatasets(response, []);
  });

  describe('Dataset name search', () => {
    // A substring may match regardless of case. Another project's matching
    // dataset must not appear in either the returned list or its total count.
    it.each(['pha', 'ALPHA'])('filters by partial, case-insensitive name "%s"', async (name) => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ name })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasets(response, [datasets.shared[0]]);
    });

    // All fixtures share this substring, but only this project's two datasets
    // should be returned. Count must use the same project and name filters.
    it('returns all matching datasets within the requested project', async () => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ name: 'project-datasets' })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasets(response, datasets.shared);
    });

    // Even an exact name match in another project must return an empty result.
    it('excludes a matching dataset that belongs only to another project', async () => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ name: datasets.unrelated[0].name })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasets(response, []);
    });

    // No matching name is a successful search with count 0, not an error.
    it('returns an empty list when no dataset name matches', async () => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ name: 'dataset-that-does-not-exist' })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasets(response, []);
    });

    // Clearing the search input must restore the project's unfiltered list.
    it('returns all project datasets for an empty name filter', async () => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ name: '' })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasets(response, datasets.shared);
    });

    // Knowing a matching dataset name cannot bypass project membership.
    it('rejects a non-member even when the search name matches', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request.get(`/projects/${users.outsider.username}/${projects.shared.id}/datasets`)
        .query({ name: 'Alpha' })
        .set('Authorization', `Bearer ${tokens.outsider}`);

      expect(response.status).toBe(403);
      expect(response.body).not.toHaveProperty('datasets');
    });
  });

  describe('Dataset staging filter', () => {
    // Both states exist in both projects. A member must receive only the
    // requested project's matching dataset, with the same filtered count.
    it.each([true, false])('filters member requests by staged=%s', async (staged) => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ staged })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasets(response, datasets.shared.filter((dataset) => dataset.is_staged === staged));
    });

    // Privileged users bypass membership, not project or staging filters.
    it.each([
      ['admin', true],
      ['admin', false],
      ['operator', true],
      ['operator', false],
    ])('filters unassociated %s requests by staged=%s', async (role, staged) => {
      const response = await request.get(`/projects/${users[role].username}/${projects.shared.id}/datasets`)
        .query({ staged })
        .set('Authorization', `Bearer ${tokens[role]}`);

      expectDatasets(response, datasets.shared.filter((dataset) => dataset.is_staged === staged));
    });

    // Name and staging filters must both match. Mismatched combinations must
    // return count 0 and [], rather than treating the filters as alternatives.
    it.each([
      ['Alpha', true, 0],
      ['Alpha', false, null],
      ['Beta', true, null],
      ['Beta', false, 1],
    ])('combines name=%s with staged=%s', async (name, staged, datasetIndex) => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ name, staged })
        .set('Authorization', `Bearer ${tokens.member}`);

      const expectedDatasets = datasetIndex === null ? [] : [datasets.shared[datasetIndex]];
      expectDatasets(response, expectedDatasets);
    });

    // An accessible empty project stays empty for either staging filter.
    it.each([true, false])('returns an empty project list for staged=%s', async (staged) => {
      const response = await request.get(`/projects/${users.member.username}/${projects.empty.id}/datasets`)
        .query({ staged })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasets(response, []);
    });

    // Neither staging filter may bypass the membership check for a user.
    it.each([true, false])('rejects a non-member requesting staged=%s', async (staged) => {
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request.get(`/projects/${users.outsider.username}/${projects.shared.id}/datasets`)
        .query({ staged })
        .set('Authorization', `Bearer ${tokens.outsider}`);

      expect(response.status).toBe(403);
      expect(response.body).not.toHaveProperty('datasets');
    });
  });

  describe('Dataset pagination', () => {
    // Fixed ID ordering avoids relying on database insertion order. Counts
    // describe all project matches, even for a zero-sized or out-of-range page.
    it.each([
      [{ take: 1, skip: 0 }, [0]],
      [{ take: 1, skip: 1 }, [1]],
      [{ skip: 1 }, [1]],
      [{ take: 10 }, [0, 1]],
      [{ take: 1, skip: 2 }, []],
      [{ take: 1, skip: 5 }, []],
      [{ take: 0, skip: 0 }, []],
    ])('paginates %j without changing the project count', async (query, datasetIndices) => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ 'sortBy[id]': 'asc', ...query })
        .set('Authorization', `Bearer ${tokens.member}`);

      const expectedDatasets = datasetIndices.map((index) => datasets.shared[index]);
      expectDatasetPage(response, expectedDatasets, datasets.shared.length);
    });

    // Apply descending order before skipping: the second item is the lowest
    // ID, not the second item from the ascending or unsorted result.
    it('applies descending ordering before the page offset', async () => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ 'sortBy[id]': 'desc', take: 1, skip: 1 })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasetPage(response, [datasets.shared[0]], datasets.shared.length);
    });

    // Search and staging filters run before pagination. The total counts only
    // the matching project dataset, even after skipping beyond that match.
    it.each([
      [{ name: 'Alpha', take: 1, skip: 0 }, [0]],
      [{ name: 'Alpha', take: 1, skip: 1 }, []],
      [{ staged: true, take: 1, skip: 0 }, [0]],
      [{ staged: true, take: 1, skip: 1 }, []],
      [{
        name: 'Beta', staged: false, take: 1, skip: 0,
      }, [1]],
      [{
        name: 'Beta', staged: false, take: 1, skip: 1,
      }, []],
    ])('paginates filtered matches for %j', async (query, datasetIndices) => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ 'sortBy[id]': 'asc', ...query })
        .set('Authorization', `Bearer ${tokens.member}`);

      const expectedDatasets = datasetIndices.map((index) => datasets.shared[index]);
      expectDatasetPage(response, expectedDatasets, 1);
    });

    // Admin/operator can read without association, but pagination and counts
    // must remain scoped to this project rather than the global dataset list.
    it.each(['admin', 'operator'])('paginates unassociated %s requests within the project', async (role) => {
      const response = await request.get(`/projects/${users[role].username}/${projects.shared.id}/datasets`)
        .query({ 'sortBy[id]': 'asc', take: 1, skip: 1 })
        .set('Authorization', `Bearer ${tokens[role]}`);

      expectDatasetPage(response, [datasets.shared[1]], datasets.shared.length);
    });

    // An accessible project without datasets returns an empty page and count 0.
    it('returns an empty page for a project with no datasets', async () => {
      const response = await request.get(`/projects/${users.member.username}/${projects.empty.id}/datasets`)
        .query({ 'sortBy[id]': 'asc', take: 1, skip: 0 })
        .set('Authorization', `Bearer ${tokens.member}`);

      expectDatasetPage(response, [], 0);
    });

    // Requesting only one item does not bypass project membership restrictions.
    it('rejects a non-member requesting a page of another project datasets', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request.get(`/projects/${users.outsider.username}/${projects.shared.id}/datasets`)
        .query({ 'sortBy[id]': 'asc', take: 1, skip: 0 })
        .set('Authorization', `Bearer ${tokens.outsider}`);

      expect(response.status).toBe(403);
      expect(response.body).not.toHaveProperty('datasets');
    });
  });

  describe('Dataset query validation', () => {
    // Valid membership and a signed token isolate input validation failures.
    // Each invalid value must return 400 with the correct query field, without
    // a dataset list or count that could be mistaken for a successful response.
    it.each([
      // The page size must be an integer, not text or a fractional value.
      ['take', 'abc'],
      ['take', '1.5'],
      // The offset must be a non-negative integer, not a negative value or text.
      ['skip', '-1'],
      ['skip', 'abc'],
      // Sorting requires an object such as { id: 'asc' }, not a plain string.
      ['sortBy', 'abc'],
    ])('rejects invalid %s=%s with a query validation error', async (field, value) => {
      const response = await request.get(`/projects/${users.member.username}/${projects.shared.id}/datasets`)
        .query({ [field]: value })
        .set('Authorization', `Bearer ${tokens.member}`);

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: field,
          location: 'query',
          msg: expect.any(String),
        }),
      ]));
      expect(response.body).not.toHaveProperty('datasets');
      expect(response.body).not.toHaveProperty('metadata');
    });
  });
});
