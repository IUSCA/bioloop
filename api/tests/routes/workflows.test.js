const { getAuthRequest } = require('../request');
const prisma = require('../../src/db');
const wf_service = require('../../src/services/workflow');

// Mock the workflow service
jest.mock('../../src/services/workflow');

describe('Workflow Revocation API', () => {
  let authRequest;
  let testUser;
  const testWorkflowId = 'test-workflow-123';

  beforeAll(async () => {
    authRequest = await getAuthRequest();
    
    // Get a test user (assuming one exists or created by seed)
    testUser = await prisma.user.findFirst({
      where: { is_deleted: false }
    });
    
    if (!testUser) {
      throw new Error('No test user found in database. Please run seed.');
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.workflow.deleteMany({
      where: { id: testWorkflowId }
    });
  });

  describe('POST /workflows/:id/pause', () => {
    it('records the revoking user in the database', async () => {
      // Mock successful pause in workflow service
      wf_service.pause.mockResolvedValue({ data: { status: 'REVOKED' } });

      const response = await authRequest.post(`/workflows/${testWorkflowId}/pause`);

      expect(response.status).toBe(200);

      // Verify database record
      const dbWorkflow = await prisma.workflow.findUnique({
        where: { id: testWorkflowId },
        include: { revoked_by: true }
      });

      expect(dbWorkflow).toBeDefined();
      expect(dbWorkflow.revoked_by_id).toBeDefined();
      expect(dbWorkflow.revoked_by).toBeDefined();
    });
  });

  describe('GET /workflows/:id', () => {
    it('includes revoked_by details in the response', async () => {
      // Mock successful getOne in workflow service
      wf_service.getOne.mockResolvedValue({ 
        data: { 
          id: testWorkflowId,
          status: 'REVOKED'
        } 
      });

      const response = await authRequest.get(`/workflows/${testWorkflowId}`);

      expect(response.status).toBe(200);
      expect(response.body.revoked_by).toBeDefined();
      expect(response.body.revoked_by.username).toBeDefined();
    });
  });

  describe('GET /workflows', () => {
    it('includes revoked_by details in the list response', async () => {
      // Mock successful getAll in workflow service
      wf_service.getAll.mockResolvedValue({ 
        data: { 
          metadata: { total: 1, skip: 0, limit: 10 },
          results: [{ 
            id: testWorkflowId,
            status: 'REVOKED'
          }]
        } 
      });

      const response = await authRequest.get('/workflows');

      expect(response.status).toBe(200);
      const workflow = response.body.results.find(w => w.id === testWorkflowId);
      expect(workflow.revoked_by).toBeDefined();
      expect(workflow.revoked_by.username).toBeDefined();
    });
  });
});
