/**
 * Integration tests for Workflow routes against the isolated API test DB.
 * Only the separate Workflow server is mocked; HTTP auth, validation, and
 * local workflow/process/log persistence use the real app and Prisma.
 */
jest.mock('../../src/services/workflow', () => ({
  getAll: jest.fn(),
  getOne: jest.fn(),
  getCountsByStatus: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  deleteOne: jest.fn(),
}));

const config = require('config');
const { request } = require('../request');
const prisma = require('../../src/db');
const workflowService = require('../../src/services/workflow');
const { issueJWT, get_user_profile } = require('../../src/services/auth');
const userService = require('../../src/services/user');

describe('Workflow API', () => {
  const prefix = `workflow-api-${Date.now()}-${process.pid}`;
  const workflowId = `${prefix}-id`;
  const users = {};
  const tokens = {};
  let dataset;
  let processNumber = 0;

  function as(actor) {
    return { Authorization: `Bearer ${tokens[actor]}` };
  }

  async function createProcess(label = 'inspect') {
    processNumber += 1;
    return prisma.worker_process.create({
      data: {
        pid: processNumber,
        task_id: `${prefix}-${label}-${processNumber}`,
        step: label,
        hostname: 'test-worker',
        workflow_id: workflowId,
      },
    });
  }

  beforeAll(async () => {
    await Promise.all(['user', 'operator', 'admin'].map(async (role) => {
      const username = `${role}-${prefix}`;
      const user = await userService.createUser({
        username,
        email: `${username}@example.com`,
        name: 'API Workflow Test User',
        roles: [role],
      });
      users[role] = user;
      tokens[role] = issueJWT({ userProfile: get_user_profile(user) });
    }));

    dataset = await prisma.dataset.create({
      data: { name: prefix, type: 'RAW_DATA' },
    });
    await prisma.workflow.create({
      data: {
        id: workflowId,
        dataset_id: dataset.id,
        initiator_id: users.admin.id,
      },
    });
  });

  beforeEach(() => {
    Object.values(workflowService).forEach((mock) => mock.mockReset());
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.worker_process.deleteMany({ where: { workflow_id: workflowId } });
  });

  afterAll(async () => {
    await prisma.workflow.deleteMany({ where: { id: { startsWith: prefix } } });
    if (dataset) await prisma.dataset.delete({ where: { id: dataset.id } });
    await prisma.notification.deleteMany({
      where: { created_by_id: { in: Object.values(users).map((user) => user.id) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(users).map((user) => user.id) } },
    });
  });

  // Workflow reads require login and a role with workflow:read permission.
  it('requires authentication for workflow names', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.get('/workflows/names');

    expect(response.status).toBe(401);
  });

  it('denies workflow reads to a regular user', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.get('/workflows/current').set(as('user'));

    expect(response.status).toBe(403);
  });

  it.each(['operator', 'admin'])('lists configured names for %s', async (actor) => {
    const response = await request.get('/workflows/names').set(as(actor));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(Object.keys(config.workflow_registry));
    expect(workflowService.getAll).not.toHaveBeenCalled();
  });

  it('returns locally registered workflows without calling the external service', async () => {
    const response = await request.get('/workflows/current').set(as('operator'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: workflowId, dataset_id: dataset.id }),
    ]));
    expect(workflowService.getAll).not.toHaveBeenCalled();
  });

  // An unmatched local dataset filter must return an empty result without a
  // network request to the separate Workflow server.
  it('returns an empty list when no local workflow matches the dataset filter', async () => {
    const response = await request.get('/workflows')
      .set(as('admin'))
      .query({ dataset_name: `${prefix}-missing` });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      metadata: { total: 0, skip: 0, limit: 0 },
      results: [],
    });
    expect(workflowService.getAll).not.toHaveBeenCalled();
  });

  it('rejects an invalid dataset ID before querying workflows', async () => {
    const response = await request.get('/workflows')
      .set(as('admin'))
      .query({ dataset_id: 'invalid' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'dataset_id', location: 'query' }),
    ]));
    expect(workflowService.getAll).not.toHaveBeenCalled();
  });

  it('filters by local dataset and enriches remote results with local details', async () => {
    workflowService.getAll.mockResolvedValue({
      data: { metadata: { total: 1, skip: 0, limit: 10 }, results: [{ id: workflowId, status: 'running' }] },
    });

    const response = await request.get('/workflows')
      .set(as('admin'))
      .query({ dataset_id: dataset.id });

    expect(response.status).toBe(200);
    expect(workflowService.getAll).toHaveBeenCalledWith(expect.objectContaining({
      app_id: config.app_id,
      workflow_ids: [workflowId],
    }));
    expect(response.body.results).toEqual([
      expect.objectContaining({
        id: workflowId,
        status: 'running',
        dataset_id: dataset.id,
        initiator: expect.objectContaining({ id: users.admin.id }),
      }),
    ]);
  });

  // Direct workflow ID and status filters are sent to the separate service;
  // the API still enriches a returned workflow with its local dataset link.
  it('forwards list filters and pagination to the external service', async () => {
    workflowService.getAll.mockResolvedValue({
      data: { metadata: { total: 1, skip: 2, limit: 5 }, results: [{ id: workflowId }] },
    });

    const response = await request.get('/workflows')
      .set(as('operator'))
      .query({
        workflow_id: workflowId,
        workflow_name: 'integrated',
        status: 'failed',
        skip: 2,
        limit: 5,
      });

    expect(response.status).toBe(200);
    expect(workflowService.getAll).toHaveBeenCalledWith(expect.objectContaining({
      workflow_ids: workflowId,
      workflow_name: 'integrated',
      status: 'failed',
      skip: '2',
      limit: '5',
      app_id: config.app_id,
    }));
    expect(response.body.metadata).toEqual({ total: 1, skip: 2, limit: 5 });
    expect(response.body.results[0]).toEqual(expect.objectContaining({
      id: workflowId,
      dataset_id: dataset.id,
    }));
  });

  it('forwards status-count requests with the application ID', async () => {
    workflowService.getCountsByStatus.mockResolvedValue({ data: { running: 2, failed: 1 } });

    const response = await request.get('/workflows/counts_by_status').set(as('admin'));

    expect(response.status).toBe(200);
    expect(workflowService.getCountsByStatus).toHaveBeenCalledWith({ app_id: config.app_id });
    expect(response.body).toEqual({ running: 2, failed: 1 });
  });

  it('denies status counts to a regular user before contacting the external service', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.get('/workflows/counts_by_status').set(as('user'));

    expect(response.status).toBe(403);
    expect(workflowService.getCountsByStatus).not.toHaveBeenCalled();
  });

  // Process registration and log storage are local DB operations. Verify both
  // HTTP responses and persisted records, including validation and role gates.
  it('registers a worker process as an operator', async () => {
    const response = await request.post('/workflows/processes')
      .set(as('operator'))
      .send({
        pid: 123,
        task_id: `${prefix}-task`,
        step: 'inspect',
        hostname: 'test-worker',
        workflow_id: workflowId,
        tags: { source: 'test' },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      pid: 123,
      step: 'inspect',
      workflow_id: workflowId,
      tags: { source: 'test' },
    }));
    expect(await prisma.worker_process.findUnique({ where: { id: response.body.id } }))
      .toEqual(expect.objectContaining({ task_id: `${prefix}-task` }));
  });

  it('rejects missing process fields without writing a record', async () => {
    const response = await request.post('/workflows/processes')
      .set(as('admin'))
      .send({ pid: 123 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'task_id', location: 'body' }),
    ]));
    expect(await prisma.worker_process.count({ where: { workflow_id: workflowId } })).toBe(0);
  });

  it('denies process creation to a regular user', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.post('/workflows/processes')
      .set(as('user'))
      .send({
        pid: 123, task_id: 'task', step: 'inspect', hostname: 'worker',
      });

    expect(response.status).toBe(403);
    expect(await prisma.worker_process.count({ where: { workflow_id: workflowId } })).toBe(0);
  });

  it('filters process reads by workflow and PID', async () => {
    const matching = await createProcess();
    await createProcess('archive');

    const response = await request.get('/workflows/processes')
      .set(as('operator'))
      .query({ workflow_id: workflowId, pid: matching.pid });

    expect(response.status).toBe(200);
    expect(response.body.map(({ id }) => id)).toEqual([matching.id]);
  });

  it('writes logs and reads only the selected process and ID range', async () => {
    const process = await createProcess();
    const other = await createProcess('archive');
    await prisma.log.create({
      data: { worker_process_id: other.id, message: 'unrelated', level: 'stdout' },
    });

    const appended = await request.post(`/workflows/processes/${process.id}/logs`)
      .set(as('admin'))
      // The current route passes undefined optional fields to Prisma. Supply
      // both fields here; missing-field behavior needs a separate API fix.
      .send([
        { message: 'first', level: 'stdout', timestamp: '2025-01-01T00:00:00Z' },
        { message: 'second', level: 'stderr', timestamp: '2025-01-01T00:01:00Z' },
      ]);

    expect(appended.status).toBe(200);
    expect(appended.body.count).toBe(2);
    const stored = await prisma.log.findMany({
      where: { worker_process_id: process.id },
      orderBy: { id: 'asc' },
    });
    expect(stored.map(({ message, level }) => ({ message, level }))).toEqual([
      { message: 'first', level: 'stdout' },
      { message: 'second', level: 'stderr' },
    ]);

    const response = await request.get(`/workflows/processes/${process.id}/logs`)
      .set(as('operator'))
      .query({ after_id: stored[0].id });

    expect(response.status).toBe(200);
    expect(response.body.map(({ id }) => id)).toEqual([stored[1].id]);
  });

  it('rejects malformed log entries without persisting any logs', async () => {
    const process = await createProcess();
    const response = await request.post(`/workflows/processes/${process.id}/logs`)
      .set(as('admin'))
      .send([{ level: 'stderr' }]);

    expect(response.status).toBe(400);
    expect(await prisma.log.count({ where: { worker_process_id: process.id } })).toBe(0);
  });

  it('rejects an invalid log cursor before querying the database', async () => {
    const process = await createProcess();
    const response = await request.get(`/workflows/processes/${process.id}/logs`)
      .set(as('operator'))
      .query({ before_id: 'invalid' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'before_id', location: 'query' }),
    ]));
  });

  it('lets an admin delete processes and their logs for a workflow', async () => {
    const process = await createProcess();
    await prisma.log.create({
      data: { worker_process_id: process.id, message: 'cleanup', level: 'stdout' },
    });

    const response = await request.delete(`/workflows/${workflowId}/processes`)
      .set(as('admin'));

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(await prisma.worker_process.count({ where: { workflow_id: workflowId } })).toBe(0);
    expect(await prisma.log.count({ where: { worker_process_id: process.id } })).toBe(0);
  });

  it('denies process deletion to an operator', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const process = await createProcess();
    const response = await request.delete(`/workflows/${workflowId}/processes`)
      .set(as('operator'));

    expect(response.status).toBe(403);
    expect(await prisma.worker_process.findUnique({ where: { id: process.id } })).not.toBeNull();
  });

  // These routes should forward to the remote service, while preserving the
  // API's read/update permissions. No remote service is needed in CI.
  it('forwards workflow detail reads to the external service', async () => {
    workflowService.getOne.mockResolvedValue({ data: { id: workflowId, status: 'running' } });

    const response = await request.get(`/workflows/${workflowId}`).set(as('admin'));

    expect(response.status).toBe(200);
    expect(workflowService.getOne).toHaveBeenCalledWith(workflowId, undefined, undefined);
    expect(response.body).toEqual({ id: workflowId, status: 'running' });
  });

  it('denies workflow detail reads to a regular user before contacting the external service', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.get(`/workflows/${workflowId}`).set(as('user'));

    expect(response.status).toBe(403);
    expect(workflowService.getOne).not.toHaveBeenCalled();
  });

  it.each([
    ['pause', 'pause'],
    ['resume', 'resume'],
  ])('forwards %s requests for an operator', async (action, method) => {
    workflowService[method].mockResolvedValue({ data: { id: workflowId, status: action } });

    const response = await request.post(`/workflows/${workflowId}/${action}`)
      .set(as('operator'));

    expect(response.status).toBe(200);
    expect(workflowService[method]).toHaveBeenCalledWith(workflowId);
    expect(response.body).toEqual({ id: workflowId, status: action });
  });

  it('denies pause to a regular user before contacting the external service', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request.post(`/workflows/${workflowId}/pause`)
      .set(as('user'));

    expect(response.status).toBe(403);
    expect(workflowService.pause).not.toHaveBeenCalled();
  });

  // Delete must call the remote service before removing the local association;
  // only admins have workflow:delete permission in the current policy.
  it('deletes a workflow remotely and then removes its local record as admin', async () => {
    const targetId = `${prefix}-disposable-delete`;
    await prisma.workflow.create({ data: { id: targetId } });
    workflowService.deleteOne.mockResolvedValue({ data: { id: targetId, deleted: true } });

    const response = await request.delete(`/workflows/${targetId}`).set(as('admin'));

    expect(response.status).toBe(200);
    expect(workflowService.deleteOne).toHaveBeenCalledWith(targetId);
    expect(response.body).toEqual({ id: targetId, deleted: true });
    expect(await prisma.workflow.findUnique({ where: { id: targetId } })).toBeNull();
    expect(await prisma.dataset.findUnique({ where: { id: dataset.id } })).not.toBeNull();
  });

  it('denies workflow deletion to an operator without changing the local record', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const targetId = `${prefix}-disposable-denied`;
    await prisma.workflow.create({ data: { id: targetId } });

    const response = await request.delete(`/workflows/${targetId}`).set(as('operator'));

    expect(response.status).toBe(403);
    expect(workflowService.deleteOne).not.toHaveBeenCalled();
    expect(await prisma.workflow.findUnique({ where: { id: targetId } })).not.toBeNull();
  });
});
