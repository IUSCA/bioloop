/**
 * Integration tests for dataset creation, update and deletion through the real
 * API and isolated test database. Each case has its own users, project and
 * dataset; assertions inspect persisted records, states and audit logs.
 * Fixtures that have not been archived avoid contacting the external workflow service.
 * Size validation cases require the production BigInt validation fix.
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

  // Use the real API for every size case. The bulk target follows a valid
  // item so a rejected request also proves that no earlier row was persisted.
  function sendSizeRequest(operation, values) {
    const authorization = `Bearer ${tokens.admin}`;
    if (operation === 'update') {
      return request.patch(`/datasets/${dataset.id}`)
        .set('Authorization', authorization)
        .send(values);
    }
    const payload = { ...createPayload(), ...values };
    if (operation === 'bulk') {
      return request.post('/datasets/bulk')
        .set('Authorization', authorization)
        .send({
          datasets: [
            {
              ...createPayload(), name: `${namePrefix}-bulk-first`, size: 10, du_size: 20, bundle_size: 30,
            },
            payload,
          ],
        });
    }
    return request.post('/datasets')
      .set('Authorization', authorization)
      .send(payload);
  }

  // Compare scoped records and relations to detect partial writes or changes
  // to the original dataset, its state history, audits or project association.
  async function sizeSnapshot() {
    return prisma.dataset.findMany({
      where: { name: { startsWith: namePrefix } },
      orderBy: { id: 'asc' },
      include: {
        states: { orderBy: [{ timestamp: 'asc' }, { state: 'asc' }] },
        audit_logs: { orderBy: { id: 'asc' } },
        projects: { orderBy: { project_id: 'asc' } },
      },
    });
  }

  function sizeResponseDataset(operation, response) {
    if (operation !== 'bulk') return response.body;
    expect(response.body.created).toHaveLength(2);
    expect(response.body.conflicted).toEqual([]);
    expect(response.body.errored).toEqual([]);
    return response.body.created.find(({ name }) => name === createPayload().name);
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

  // Identifier validation must reject an update without touching the dataset.
  // Numeric field validation is covered separately for all three endpoints.
  it('rejects an update with an invalid ID', async () => {
    const before = await getStoredDataset();
    const response = await request.patch('/datasets/not-a-number')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ description: 'Bad update' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'id', location: 'params' }),
    ]));
    expect(await getStoredDataset()).toEqual(before);
  });

  describe.each(['create', 'update', 'bulk'])('%s size validation', (operation) => {
    const fields = ['size', 'du_size', 'bundle_size'];
    const invalidValues = [
      ['text', 'not-a-number'],
      ['decimal number', 1.5],
      ['decimal string', '1.5'],
      ['empty string', ''],
      ['blank string', '   '],
      ['null', null],
      ['true', true],
      ['false', false],
      ['empty array', []],
      ['single-item array', ['1']],
      ['multiple-item array', ['1', '2']],
      ['object', { value: 123 }],
      ['exponent string', '1e3'],
      ['hex string', '0x10'],
      ['unsafe JSON number', Number.MAX_SAFE_INTEGER + 1],
      ['above the database maximum', '9223372036854775808'],
      ['below the database minimum', '-9223372036854775809'],
    ];
    const invalidCases = fields.flatMap((field) => invalidValues.map(([label, value]) => [field, label, value]));

    // Every field must return a structured 400 instead of a conversion/DB 500.
    // Include a valid description to catch a partially applied PATCH as well.
    it.each(invalidCases)('rejects %s containing %s without database changes', async (field, _label, value) => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const before = await sizeSnapshot();
      const response = await sendSizeRequest(operation, {
        [field]: value,
        description: 'Must not be persisted',
      });

      expect(response.status).toBe(400);
      const errorPath = operation === 'bulk' ? `datasets[1].${field}` : field;
      expect(response.body.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: errorPath, location: 'body' }),
      ]));
      expect(await sizeSnapshot()).toEqual(before);
    });

    // Distinct field values catch incorrect mappings. Large integers travel
    // as strings, remain exact in PostgreSQL and serialize as decimal strings.
    // Signed values preserve the existing integer policy; this is not a new
    // non-negative file-size restriction.
    it.each([
      ['integer numbers', { size: 101, du_size: 202, bundle_size: 303 }],
      ['integer strings', { size: '101', du_size: '202', bundle_size: '303' }],
      ['zero numbers', { size: 0, du_size: 0, bundle_size: 0 }],
      ['zero strings', { size: '0', du_size: '0', bundle_size: '0' }],
      ['formatted decimal strings', { size: ' 101 ', du_size: '+202', bundle_size: '-303' }],
      ['large exact strings', {
        size: '9007199254740993', du_size: '9007199254740995', bundle_size: '9007199254740997',
      }],
      ['database boundaries', {
        size: '9223372036854775807', du_size: '-9223372036854775808', bundle_size: '-1',
      }],
      ['safe JSON boundaries', {
        size: Number.MAX_SAFE_INTEGER, du_size: Number.MAX_SAFE_INTEGER - 1, bundle_size: -Number.MAX_SAFE_INTEGER,
      }],
    ])('stores %s exactly', async (_label, values) => {
      const response = await sendSizeRequest(operation, values);

      expect(response.status).toBe(200);
      const result = sizeResponseDataset(operation, response);
      expect(result).toBeDefined();
      const stored = await prisma.dataset.findUniqueOrThrow({ where: { id: result.id } });
      fields.forEach((field) => {
        const expected = BigInt(values[field]);
        expect(stored[field]).toBe(expected);
        expect(result[field]).toBe(expected.toString());
      });
    });

    // Omitted fields stay null on creation; PATCH must preserve existing sizes.
    it('accepts omitted sizes without resetting existing values', async () => {
      const existing = { size: 101n, du_size: 202n, bundle_size: 303n };
      if (operation === 'update') {
        await prisma.dataset.update({ where: { id: dataset.id }, data: existing });
      }
      const response = await sendSizeRequest(operation, { description: 'Sizes omitted' });

      expect(response.status).toBe(200);
      const result = sizeResponseDataset(operation, response);
      expect(result).toBeDefined();
      const stored = await prisma.dataset.findUniqueOrThrow({ where: { id: result.id } });
      fields.forEach((field) => {
        const expected = operation === 'update' ? existing[field] : null;
        expect(stored[field]).toBe(expected);
        expect(result[field]).toBe(expected === null ? null : expected.toString());
      });
    });
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
