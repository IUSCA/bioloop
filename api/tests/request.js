const path = require('path');

global.__basedir = path.join(__dirname, '..');

// eslint-disable-next-line import/no-extraneous-dependencies
const request = require('supertest');
const issueToken = require('../src/scripts/issue_token');

const server = 'http://localhost:9001';
let token = null;

async function getAuthRequest() {
  if (!token) {
    token = await issueToken('svc_tasks', { forever: true });
  }

  // Return a function that delegates to `request(server).<verb>().set(...)`
  return {
    get: (url) => request(server).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(server).post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request(server).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request(server).delete(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => request(server).patch(url).set('Authorization', `Bearer ${token}`),
  };
}

module.exports = { request: request(server), getAuthRequest };
