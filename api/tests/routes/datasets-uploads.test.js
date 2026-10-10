/**
 * Integration tests for the API-managed upload lifecycle. Supertest calls the
 * real app against the isolated test database; no TUS bytes or external
 * workflow service are needed for registration and status transitions.
 */
const path = require('path');
const config = require('config');
const { request } = require('../request');
const prisma = require('../../src/db');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');
const { UPLOAD_STATUSES } = require('../../src/constants');

describe('Dataset upload API', () => {
  let fixtureNumber = 0;
  let namePrefix;
  let users;
  let tokens;
  let project;

  function uploadPayload() {
    return {
      name: `${namePrefix}-new`,
      type: 'RAW_DATA',
      project_id: project.id,
    };
  }

  async function registerUpload(label = 'owner', overrides = {}) {
    return request.post('/datasets/uploads')
      .set('Authorization', `Bearer ${tokens[label]}`)
      .send({ ...uploadPayload(), ...overrides });
  }

  async function getStoredUpload(datasetId) {
    return prisma.dataset_upload_log.findUniqueOrThrow({
      where: { dataset_id: datasetId },
      include: { dataset: { include: { states: true, audit_logs: true, projects: true } } },
    });
  }

  beforeEach(async () => {
    fixtureNumber += 1;
    namePrefix = `upload-api-${Date.now()}-${process.pid}-${fixtureNumber}`;
    users = {};
    tokens = {};

    async function createAccount(label, role) {
      const username = `${label}-${namePrefix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Upload Test User',
        roles: [role],
      });
      users[label] = user;
      tokens[label] = issueJWT({ userProfile: get_user_profile(user) });
    }

    await createAccount('owner', 'user');
    await createAccount('outsider', 'user');
    await createAccount('operator', 'operator');
    await createAccount('admin', 'admin');

    project = await prisma.project.create({
      data: {
        name: namePrefix,
        slug: namePrefix,
        owner_id: users.owner.id,
        users: { create: { user_id: users.owner.id } },
      },
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // A failed assertion after a successful request must not leave records in
    // the test DB. Terminal uploads may have a "--id" tombstone suffix.
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.dataset.deleteMany({ where: { name: { startsWith: namePrefix } } });
    await prisma.notification.deleteMany({
      where: { created_by_id: { in: Object.values(users).map((user) => user.id) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(users).map((user) => user.id) } },
    });
  });

  // No token means no dataset, upload log or project association is created.
  it('rejects registration without authentication', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.post('/datasets/uploads').send(uploadPayload());

    expect(response.status).toBe(401);
    expect(await prisma.dataset.count({ where: { name: uploadPayload().name } })).toBe(0);
  });

  // Current API policy lets all three roles register an upload. Persisted
  // origin_path, create method, state, audit and association matter as much as
  // the response because the worker uses those records later.
  it.each(['owner', 'operator', 'admin'])('registers an upload for %s', async (label) => {
    const response = await registerUpload(label);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      id: expect.any(Number),
      status: UPLOAD_STATUSES.UPLOADING,
      dataset: expect.objectContaining({
        id: expect.any(Number),
        name: uploadPayload().name,
        type: 'RAW_DATA',
        create_method: 'UPLOAD',
      }),
    }));

    const stored = await getStoredUpload(response.body.dataset.id);
    const uploadBasePath = config.get('upload.host_path') || config.get('upload.path');
    expect(stored).toEqual(expect.objectContaining({
      id: response.body.id,
      status: UPLOAD_STATUSES.UPLOADING,
      process_id: null,
    }));
    expect(stored.dataset.origin_path).toBe(path.join(
      uploadBasePath,
      'raw_data',
      String(stored.dataset.id),
      stored.dataset.name,
    ));
    expect(stored.dataset.states).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: 'REGISTERED' }),
    ]));
    expect(stored.dataset.audit_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'create', user_id: users[label].id }),
    ]));
    expect(stored.dataset.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ project_id: project.id, assignor_id: users[label].id }),
    ]));
  });

  // Bad input must stop registration before it writes a dataset or upload log.
  it.each([
    ['missing name', { name: undefined }, 'name'],
    ['short name', { name: 'ab' }, 'name'],
    ['invalid type', { type: 'INVALID' }, 'type'],
  ])('rejects registration with %s', async (_label, overrides, field) => {
    const response = await registerUpload('owner', overrides);

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: field, location: 'body' }),
    ]));
    expect(await prisma.dataset.count({ where: { name: { startsWith: namePrefix } } })).toBe(0);
    expect(await prisma.dataset_upload_log.count({
      where: { dataset: { name: { startsWith: namePrefix } } },
    })).toBe(0);
  });

  // Only the creator or an admin/operator can complete an upload. Check the
  // stored row remains UPLOADING when authentication or ownership fails.
  it.each([
    ['anonymous', null, 401],
    ['other user', 'outsider', 403],
  ])('rejects completion by %s', async (_label, actor, status) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;

    let operation = request.post(`/datasets/uploads/${datasetId}/complete`);
    if (actor) operation = operation.set('Authorization', `Bearer ${tokens[actor]}`);
    const response = await operation.send({ process_id: 'test-process-id' });

    expect(response.status).toBe(status);
    expect(await getStoredUpload(datasetId)).toEqual(expect.objectContaining({
      status: UPLOAD_STATUSES.UPLOADING,
      process_id: null,
    }));
  });

  // Registration followed by completion changes only the DB-managed state;
  // TUS file transfer is intentionally outside this route-level test.
  it.each(['owner', 'operator', 'admin'])('completes an upload as %s', async (actor) => {
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;

    const response = await request.post(`/datasets/uploads/${datasetId}/complete`)
      .set('Authorization', `Bearer ${tokens[actor]}`)
      .send({ process_id: 'test-process-id', metadata: { manifest_hash: 'abc123' } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.upload_log).toEqual(expect.objectContaining({
      id: registered.body.id,
      status: UPLOAD_STATUSES.UPLOADED,
      process_id: 'test-process-id',
      metadata: { manifest_hash: 'abc123' },
    }));
    expect(await getStoredUpload(datasetId)).toEqual(expect.objectContaining({
      status: UPLOAD_STATUSES.UPLOADED,
      process_id: 'test-process-id',
      metadata: { manifest_hash: 'abc123' },
    }));
  });

  // Missing process_id is rejected before the upload log changes.
  it('requires a process ID to complete an upload', async () => {
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;

    const response = await request.post(`/datasets/uploads/${datasetId}/complete`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'process_id', location: 'body' }),
    ]));
    expect((await getStoredUpload(datasetId)).status).toBe(UPLOAD_STATUSES.UPLOADING);
  });

  // A retry after success is idempotent: it must not replace the original
  // process ID or metadata with values from the repeated request.
  it('does not change an upload completed twice', async () => {
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;
    const url = `/datasets/uploads/${datasetId}/complete`;

    const first = await request.post(url)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ process_id: 'first', metadata: { hash: 'first' } });
    expect(first.status).toBe(200);

    const second = await request.post(url)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ process_id: 'second', metadata: { hash: 'second' } });

    expect(second.status).toBe(200);
    expect(second.body.upload_log).toEqual(expect.objectContaining({
      status: UPLOAD_STATUSES.UPLOADED,
      process_id: 'first',
      metadata: { hash: 'first' },
    }));
    expect(await getStoredUpload(datasetId)).toEqual(expect.objectContaining({
      status: UPLOAD_STATUSES.UPLOADED,
      process_id: 'first',
      metadata: { hash: 'first' },
    }));
  });

  // If a worker has already advanced verification, a late completion must
  // not regress the log back to UPLOADED.
  it('rejects completion after verification has started', async () => {
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;
    await prisma.dataset_upload_log.update({
      where: { dataset_id: datasetId },
      data: { status: UPLOAD_STATUSES.VERIFYING },
    });

    const response = await request.post(`/datasets/uploads/${datasetId}/complete`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ process_id: 'late-process-id' });

    expect(response.status).toBe(409);
    expect(response.body.status).toBe(UPLOAD_STATUSES.VERIFYING);
    expect(await getStoredUpload(datasetId)).toEqual(expect.objectContaining({
      status: UPLOAD_STATUSES.VERIFYING,
      process_id: null,
    }));
  });

  // The owner can update their upload status, but an unrelated user cannot.
  it('limits upload-status updates to the creator or privileged roles', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;

    const denied = await request.patch(`/datasets/uploads/${datasetId}`)
      .set('Authorization', `Bearer ${tokens.outsider}`)
      .send({ status: UPLOAD_STATUSES.UPLOADED });
    expect(denied.status).toBe(403);
    expect((await getStoredUpload(datasetId)).status).toBe(UPLOAD_STATUSES.UPLOADING);

    const allowed = await request.patch(`/datasets/uploads/${datasetId}`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ status: UPLOAD_STATUSES.UPLOADED });
    expect(allowed.status).toBe(200);
    expect(allowed.body.status).toBe(UPLOAD_STATUSES.UPLOADED);
    expect((await getStoredUpload(datasetId)).status).toBe(UPLOAD_STATUSES.UPLOADED);
  });

  // Worker-facing metadata updates merge into the JSONB field instead of
  // replacing existing keys, and commit status/retry changes together.
  it('merges upload metadata and status through the worker update route', async () => {
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;
    await prisma.dataset_upload_log.update({
      where: { dataset_id: datasetId },
      data: { metadata: { existing: 'kept' } },
    });

    const response = await request.patch(`/datasets/uploads/${datasetId}/upload-log`)
      .set('Authorization', `Bearer ${tokens.operator}`)
      .send({
        metadata: { manifest_hash: 'abc123' },
        status: UPLOAD_STATUSES.VERIFYING,
        retry_count: 1,
      });

    expect(response.status).toBe(200);
    expect(response.body.upload_log).toEqual(expect.objectContaining({
      status: UPLOAD_STATUSES.VERIFYING,
      retry_count: 1,
      metadata: { existing: 'kept', manifest_hash: 'abc123' },
    }));
    expect(await getStoredUpload(datasetId)).toEqual(expect.objectContaining({
      status: UPLOAD_STATUSES.VERIFYING,
      retry_count: 1,
      metadata: { existing: 'kept', manifest_hash: 'abc123' },
    }));
  });

  // A terminal failure frees the original name for another upload, while the
  // failed log and tombstoned dataset remain available for diagnosis.
  it('tombstones a terminally failed upload', async () => {
    const registered = await registerUpload();
    expect(registered.status).toBe(200);
    const datasetId = registered.body.dataset.id;

    const response = await request.patch(`/datasets/uploads/${datasetId}/upload-log`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ status: UPLOAD_STATUSES.VERIFICATION_FAILED });

    expect(response.status).toBe(200);
    expect((await getStoredUpload(datasetId)).status).toBe(UPLOAD_STATUSES.VERIFICATION_FAILED);
    expect(await prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } }))
      .toEqual(expect.objectContaining({
        name: `${uploadPayload().name}--${datasetId}`,
        is_deleted: true,
      }));
    expect(await prisma.dataset.findFirst({
      where: { name: uploadPayload().name, type: 'RAW_DATA', is_deleted: false },
    })).toBeNull();
  });
});
