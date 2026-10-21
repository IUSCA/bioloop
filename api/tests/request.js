// eslint-disable-next-line import/no-extraneous-dependencies
const supertest = require('supertest');
const app = require('../src/app');
const issueToken = require('../src/scripts/issue_token');

const request = supertest(app);
let token = null;

async function getAuthRequest() {
  if (!token) {
    token = await issueToken('svc_tasks', { forever: true });
  }

  // Attach the service-account token to requests against the in-process app.
  return {
    get: (url) => request.get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request.post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request.put(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request.delete(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => request.patch(url).set('Authorization', `Bearer ${token}`),
  };
}

module.exports = { request, getAuthRequest };
