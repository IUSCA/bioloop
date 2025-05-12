const { request } = require('../request');

describe('GET /health', () => {
  it('responds with OK', async () => {
    const response = await request.get('/health');

    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });
});
