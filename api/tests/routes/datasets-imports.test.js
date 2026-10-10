/**
 * Integration tests for the import-source, dataset registration and history
 * APIs. Use the real app and isolated test DB; import paths are allowlisted
 * database values, so no external filesystem or workflow service is needed.
 */
const path = require('path');
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

describe('Dataset import API', () => {
  let fixtureNumber = 0;
  let namePrefix;
  let users;
  let tokens;
  let projects;
  let sources;

  function importPayload(label = 'new', actor = 'owner') {
    return {
      name: `${namePrefix}-${label}`,
      type: 'RAW_DATA',
      origin_path: path.join(sources.primary.path, `${label}-run`),
      create_method: 'IMPORT',
      project_id: projects[actor === 'other' ? 'other' : 'owner'].id,
    };
  }

  async function createImport(label = 'new', actor = 'owner', overrides = {}) {
    return request.post('/datasets')
      .set('Authorization', `Bearer ${tokens[actor]}`)
      .send({ ...importPayload(label, actor), ...overrides });
  }

  beforeEach(async () => {
    fixtureNumber += 1;
    namePrefix = `import-api-${Date.now()}-${process.pid}-${fixtureNumber}`;
    users = {};
    tokens = {};
    projects = {};
    sources = {};

    async function createAccount(label, role) {
      const username = `${label}-${namePrefix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Import Test User',
        roles: [role],
      });
      users[label] = user;
      tokens[label] = issueJWT({ userProfile: get_user_profile(user) });
    }

    await createAccount('owner', 'user');
    await createAccount('other', 'user');
    await createAccount('operator', 'operator');
    await createAccount('admin', 'admin');

    // Each regular user has their own project. This keeps import ownership
    // separate without invoking automatic project creation.
    await Promise.all(['owner', 'other'].map(async (label) => {
      projects[label] = await prisma.project.create({
        data: {
          name: `${label}-${namePrefix}`,
          slug: `${label}-${namePrefix}`,
          owner_id: users[label].id,
          users: { create: { user_id: users[label].id } },
        },
      });
    }));

    sources.primary = await prisma.import_source.create({
      data: {
        path: `/imports/${namePrefix}/primary`,
        label: 'Primary import source',
        sort_order: 1,
      },
    });
    sources.secondary = await prisma.import_source.create({
      data: {
        path: `/imports/${namePrefix}/secondary`,
        label: 'Secondary import source',
      },
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Delete only this test's projects, imports, notifications, sources and
    // accounts. This also catches a request that wrote data before an assertion.
    await prisma.project.deleteMany({
      where: { id: { in: Object.values(projects).map((project) => project.id) } },
    });
    await prisma.dataset.deleteMany({ where: { name: { startsWith: namePrefix } } });
    await prisma.notification.deleteMany({
      where: { created_by_id: { in: Object.values(users).map((user) => user.id) } },
    });
    await prisma.import_source.deleteMany({
      where: { id: { in: Object.values(sources).map((source) => source.id) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(users).map((user) => user.id) } },
    });
  });

  // Source paths are not public; the request must be authenticated first.
  it('requires authentication to list import sources', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.get('/datasets/imports/sources');

    expect(response.status).toBe(401);
  });

  // The current access-control grants import_sources:read:any only to admin
  // and operator. Regular users can register imports but cannot list sources;
  // whether that mismatch is intended needs a separate policy decision.
  it('denies a regular user access to the import-source list', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.get('/datasets/imports/sources')
      .set('Authorization', `Bearer ${tokens.owner}`);

    expect(response.status).toBe(403);
  });

  it.each(['operator', 'admin'])('lists import sources for %s', async (actor) => {
    const response = await request.get('/datasets/imports/sources')
      .set('Authorization', `Bearer ${tokens[actor]}`);

    expect(response.status).toBe(200);
    expect(response.body.map(({ id }) => id)).toEqual([
      sources.primary.id,
      sources.secondary.id,
    ]);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: sources.primary.path, label: sources.primary.label }),
      expect.objectContaining({ path: sources.secondary.path, label: sources.secondary.label }),
    ]));
  });

  // Import registration is POST /datasets with create_method=IMPORT, not a
  // separate POST route under /datasets/imports.
  it('rejects import registration without authentication', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.post('/datasets').send(importPayload());

    expect(response.status).toBe(401);
    expect(await prisma.dataset.count({ where: { name: importPayload().name } })).toBe(0);
  });

  // Each permitted role may register an import within an allowlisted source.
  // Check its method, path, project link, initial state, audit and import log.
  it.each(['owner', 'other', 'operator', 'admin'])('registers an import for %s', async (actor) => {
    const payload = importPayload('new', actor);
    const response = await createImport('new', actor);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: expect.any(Number),
      name: payload.name,
      type: payload.type,
      origin_path: payload.origin_path,
      create_method: 'IMPORT',
      is_deleted: false,
    }));

    const stored = await prisma.dataset.findUniqueOrThrow({
      where: { id: response.body.id },
      include: {
        import_logs: true, states: true, audit_logs: true, projects: true,
      },
    });
    expect(stored.origin_path).toBe(payload.origin_path);
    expect(stored.create_method).toBe('IMPORT');
    expect(stored.import_logs).toEqual([
      expect.objectContaining({ dataset_id: stored.id, source_run: null }),
    ]);
    expect(stored.states).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'REGISTERED' }),
    ]));
    expect(stored.audit_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'create', user_id: users[actor].id }),
    ]));
    expect(stored.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ project_id: payload.project_id, assignor_id: users[actor].id }),
    ]));
  });

  // A derived import records both the source dataset relationship and its ID
  // in the import log so the UI and workers can trace its origin.
  it('records source-dataset lineage for a derived import', async () => {
    const sourceDataset = await prisma.dataset.create({
      data: { name: `${namePrefix}-source`, type: 'RAW_DATA' },
    });
    const response = await createImport('derived', 'owner', { src_dataset_id: sourceDataset.id });

    expect(response.status).toBe(200);
    const stored = await prisma.dataset.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { import_logs: true, source_datasets: true },
    });
    expect(stored.import_logs).toEqual([
      expect.objectContaining({ source_run: String(sourceDataset.id) }),
    ]);
    expect(stored.source_datasets).toEqual([
      expect.objectContaining({ source_id: sourceDataset.id, derived_id: stored.id }),
    ]);
  });

  // A sibling path with the same textual prefix is not inside the configured
  // source; imports from roots without configuration must be forbidden too.
  it.each([
    ['root without configuration', '/outside/import-run'],
    ['sibling prefix', null],
  ])('rejects an origin path in %s', async (_label, pathOverride) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const originPath = pathOverride || `${sources.primary.path}-sibling/run`;
    const response = await createImport('outside', 'owner', { origin_path: originPath });

    expect(response.status).toBe(403);
    expect(await prisma.dataset.count({ where: { name: importPayload('outside').name } })).toBe(0);
    expect(await prisma.dataset_import_log.count({
      where: { dataset: { name: importPayload('outside').name } },
    })).toBe(0);
  });

  // Malformed dataset fields must be rejected before the import log exists.
  it.each([
    ['missing name', { name: undefined }, 'name'],
    ['invalid type', { type: 'INVALID' }, 'type'],
    ['missing origin path', { origin_path: undefined }, 'origin_path'],
  ])('rejects import registration with %s', async (_label, overrides, field) => {
    const response = await createImport('invalid', 'owner', overrides);

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: field, location: 'body' }),
    ]));
    expect(await prisma.dataset.count({ where: { name: importPayload('invalid').name } })).toBe(0);
  });

  // Registering the same active name/type twice must not create a second
  // dataset or import-log row.
  it('rejects a duplicate import with a conflict', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const first = await createImport('duplicate');
    expect(first.status).toBe(200);

    const second = await createImport('duplicate');

    expect(second.status).toBe(409);
    expect(await prisma.dataset.count({ where: { name: importPayload('duplicate').name } })).toBe(1);
    expect(await prisma.dataset_import_log.count({ where: { dataset_id: first.body.id } })).toBe(1);
  });

  // A user sees only their own import history; the global history endpoint
  // requires admin/operator. Compare exact IDs rather than just result count.
  it('keeps regular-user import history scoped to the creator', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const own = await createImport('owner-run');
    const other = await createImport('other-run', 'other');
    expect(own.status).toBe(200);
    expect(other.status).toBe(200);

    const ownHistory = await request.get(`/datasets/${users.owner.username}/imports`)
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(ownHistory.status).toBe(200);
    expect(ownHistory.body.metadata.count).toBe(1);
    expect(ownHistory.body.imports.map((item) => item.dataset.id)).toEqual([own.body.id]);
    expect(ownHistory.body.imports[0].dataset.audit_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ user: expect.objectContaining({ id: users.owner.id }) }),
    ]));

    const deniedOther = await request.get(`/datasets/${users.other.username}/imports`)
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(deniedOther.status).toBe(403);

    const deniedGlobal = await request.get('/datasets/imports')
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(deniedGlobal.status).toBe(403);
  });

  it.each(['operator', 'admin'])('allows %s to read global import history', async (actor) => {
    const own = await createImport('owner-run');
    const other = await createImport('other-run', 'other');
    expect(own.status).toBe(200);
    expect(other.status).toBe(200);

    const response = await request.get('/datasets/imports')
      .set('Authorization', `Bearer ${tokens[actor]}`)
      .query({ sort_by: 'id', sort_order: 'asc' });

    expect(response.status).toBe(200);
    expect(response.body.metadata.count).toBe(2);
    expect(response.body.imports.map((item) => item.dataset.id).sort((a, b) => a - b))
      .toEqual([own.body.id, other.body.id].sort((a, b) => a - b));
  });

  // Search and pagination count only matching imports, not all datasets or
  // imports owned by someone else.
  it('filters and paginates a user import history', async () => {
    const alpha = await createImport('Alpha-one');
    const another = await createImport('Alpha-two');
    const other = await createImport('Alpha-other', 'other');
    expect(alpha.status).toBe(200);
    expect(another.status).toBe(200);
    expect(other.status).toBe(200);

    const response = await request.get(`/datasets/${users.owner.username}/imports`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .query({
        dataset_name: 'ALPHA', limit: 1, offset: 1, sort_by: 'id', sort_order: 'asc',
      });

    expect(response.status).toBe(200);
    expect(response.body.metadata.count).toBe(2);
    expect(response.body.imports.map((item) => item.dataset.id)).toEqual([another.body.id]);
  });

  // Validate history query parameters before accessing the import log list.
  it.each([
    ['zero limit', { limit: 0 }, 'limit'],
    ['negative offset', { offset: -1 }, 'offset'],
    ['empty dataset name', { dataset_name: ' ' }, 'dataset_name'],
  ])('rejects an import history query with %s', async (_label, params, field) => {
    const response = await request.get(`/datasets/${users.owner.username}/imports`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .query(params);

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: field, location: 'query' }),
    ]));
  });
});
