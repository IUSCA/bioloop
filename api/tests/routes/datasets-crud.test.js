/**
 * Integration tests for dataset creation, update and deletion through the real
 * API and isolated test database. Each case has its own users, project and
 * dataset; assertions inspect persisted records, states and audit logs.
 * Fixtures that have not been archived avoid contacting the external workflow service.
 */
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

describe('Dataset create, update and delete', () => {
  let fixtureNumber = 0;
  let namePrefix;
  let users;
  let tokens;
  let project;
  let dataset;

  async function getStoredDataset() {
    return prisma.dataset.findUniqueOrThrow({ where: { id: dataset.id } });
  }

  beforeEach(async () => {
    fixtureNumber += 1;
    const suffix = `${Date.now()}-${process.pid}-${fixtureNumber}`;
    namePrefix = `dataset-crud-${suffix}`;
    users = {};
    tokens = {};

    async function createAccount(role) {
      const username = `${role}-${namePrefix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Dataset CRUD Test User',
        roles: [role],
      });
      users[role] = user;
      tokens[role] = issueJWT({ userProfile: get_user_profile(user) });
    }

    await createAccount('user');
    await createAccount('admin');
    await createAccount('operator');

    dataset = await prisma.dataset.create({
      data: {
        name: `${namePrefix}-original`,
        type: 'RAW_DATA',
        origin_path: `/tmp/${namePrefix}`,
        description: 'Original description',
        metadata: { study: 'original', nested: { keep: true, change: 'before' } },
        states: { create: { state: 'REGISTERED' } },
      },
    });
    project = await prisma.project.create({
      data: {
        name: namePrefix,
        slug: namePrefix,
        owner_id: users.user.id,
        users: { create: { user_id: users.user.id } },
        datasets: { create: { dataset_id: dataset.id } },
      },
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Only remove this case's fixtures, including datasets created by a
    // request that succeeded before a later assertion failed.
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.dataset.deleteMany({ where: { name: { startsWith: namePrefix } } });
    await prisma.notification.deleteMany({
      where: { created_by_id: { in: Object.values(users).map((user) => user.id) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(users).map((user) => user.id) } },
    });
  });

  function createPayload() {
    return {
      name: `${namePrefix}-new`,
      type: 'RAW_DATA',
      origin_path: `/tmp/${namePrefix}-new`,
      description: 'Created through the API',
      project_id: project.id,
    };
  }

  // Authentication must reject creation before inserting a dataset.
  it('rejects creation without a token', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.post('/datasets').send(createPayload());

    expect(response.status).toBe(401);
    expect(await prisma.dataset.count({ where: { name: createPayload().name } })).toBe(0);
  });

  // All three roles may create a dataset. Check the new record, project
  // association, initial state and creation audit in the database.
  it.each(['user', 'operator', 'admin'])('allows %s to create a dataset', async (role) => {
    const payload = createPayload();
    const response = await request.post('/datasets')
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: expect.any(Number),
      name: payload.name,
      type: payload.type,
      origin_path: payload.origin_path,
      description: payload.description,
      is_deleted: false,
    }));

    const stored = await prisma.dataset.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { projects: true, states: true, audit_logs: true },
    });
    expect(stored).toEqual(expect.objectContaining({
      name: payload.name,
      type: payload.type,
      origin_path: payload.origin_path,
      description: payload.description,
      is_deleted: false,
    }));
    expect(stored.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ project_id: project.id, assignor_id: users[role].id }),
    ]));
    expect(stored.states).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'REGISTERED' }),
    ]));
    expect(stored.audit_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'create', user_id: users[role].id }),
    ]));
  });

  // A repeated name/type pair must return a conflict without inserting a row.
  it('rejects a duplicate active dataset', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const beforeCount = await prisma.dataset.count();
    const response = await request.post('/datasets')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ ...createPayload(), name: dataset.name });

    expect(response.status).toBe(409);
    expect(await prisma.dataset.count()).toBe(beforeCount);
    expect(await getStoredDataset()).toEqual(expect.objectContaining({ is_deleted: false }));
  });

  // Validation rejects malformed data before any dataset or association exists.
  it.each([
    ['missing name', { name: undefined }, 'name'],
    ['invalid type', { type: 'INVALID' }, 'type'],
    ['missing origin path', { origin_path: undefined }, 'origin_path'],
  ])('rejects creation with %s', async (_label, overrides, field) => {
    const payload = { ...createPayload(), ...overrides };
    const response = await request.post('/datasets')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: field, location: 'body' }),
    ]));
    expect(await prisma.dataset.findFirst({ where: { name: createPayload().name } })).toBeNull();
  });

  // A missing token or regular-user role must not alter the stored dataset.
  it.each([
    ['anonymous', null, 401],
    ['user', 'user', 403],
  ])('rejects %s updating a dataset', async (_label, role, status) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredDataset();
    let operation = request.patch(`/datasets/${dataset.id}`);
    if (role) operation = operation.set('Authorization', `Bearer ${tokens[role]}`);
    const response = await operation.send({ description: 'Unauthorized change' });

    expect(response.status).toBe(status);
    expect(await getStoredDataset()).toEqual(before);
  });

  // Authorized updates persist fields and deep-merge metadata without
  // dropping keys that were not included in the request.
  it.each(['operator', 'admin'])('allows %s to update a dataset', async (role) => {
    const response = await request.patch(`/datasets/${dataset.id}`)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send({
        description: 'Updated description',
        metadata: { nested: { change: 'after', added: true } },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: dataset.id,
      description: 'Updated description',
      metadata: {
        study: 'original',
        nested: { keep: true, change: 'after', added: true },
      },
    }));
    expect(await getStoredDataset()).toEqual(expect.objectContaining({
      name: dataset.name,
      type: dataset.type,
      description: 'Updated description',
      metadata: response.body.metadata,
    }));
  });

  // Invalid identifiers and empty numeric fields fail before Prisma changes
  // data. Non-numeric size currently throws from the BigInt sanitizer and
  // returns 500; that existing API bug needs a separate production fix.
  it.each([
    ['invalid ID', 'not-a-number', { description: 'Bad update' }, 'id', 'params'],
    ['empty size', null, { size: '' }, 'size', 'body'],
  ])('rejects an update with %s', async (_label, id, body, field, location) => {
    const before = await getStoredDataset();
    const response = await request.patch(`/datasets/${id ?? dataset.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: field, location }),
    ]));
    expect(await getStoredDataset()).toEqual(before);
  });

  it('returns 404 when updating a missing dataset', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.patch('/datasets/0')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ description: 'Missing' });

    expect(response.status).toBe(404);
  });

  // Delete access is limited to admin/operator; denied requests leave both
  // the dataset row and its state history untouched.
  it.each([
    ['anonymous', null, 401],
    ['user', 'user', 403],
  ])('rejects %s deleting a dataset', async (_label, role, status) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredDataset();
    let operation = request.delete(`/datasets/${dataset.id}`);
    if (role) operation = operation.set('Authorization', `Bearer ${tokens[role]}`);
    const response = await operation;

    expect(response.status).toBe(status);
    expect(await getStoredDataset()).toEqual(before);
    expect(await prisma.dataset_state.count({ where: { dataset_id: dataset.id } })).toBe(1);
    expect(await prisma.dataset_audit.count({ where: { dataset_id: dataset.id } })).toBe(0);
  });

  // Datasets that have not been archived are soft-deleted locally: the row
  // remains, a DELETED state is appended and an audit record records the caller.
  it.each(['operator', 'admin'])('allows %s to soft-delete a dataset', async (role) => {
    const response = await request.delete(`/datasets/${dataset.id}`)
      .set('Authorization', `Bearer ${tokens[role]}`);

    expect(response.status).toBe(200);
    expect(await getStoredDataset()).toEqual(expect.objectContaining({
      id: dataset.id,
      is_deleted: true,
    }));
    const states = await prisma.dataset_state.findMany({ where: { dataset_id: dataset.id } });
    expect(states.map(({ state }) => state).sort()).toEqual(['DELETED', 'REGISTERED']);
    const audits = await prisma.dataset_audit.findMany({ where: { dataset_id: dataset.id } });
    expect(audits).toEqual([
      expect.objectContaining({ action: 'delete', user_id: users[role].id }),
    ]);
  });

  // Parameter validation and missing-record handling must not touch the
  // existing dataset, even for an authorized caller.
  it.each([
    ['invalid ID', 'not-a-number', 400],
    ['missing ID', '0', 404],
  ])('rejects deletion with %s', async (_label, id, status) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = await getStoredDataset();
    const response = await request.delete(`/datasets/${id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(response.status).toBe(status);
    expect(await getStoredDataset()).toEqual(before);
  });
});
