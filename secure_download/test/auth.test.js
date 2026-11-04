const assert = require('node:assert/strict');
const test = require('node:test');

const express = require('express');

const { authenticate } = require('../src/middleware/auth');
const { errorHandler, notFound } = require('../src/middleware/error');
const { request } = require('./helpers');

function create_auth_app() {
  const app = express();
  app.use(authenticate);
  app.get('/ok', (req, res) => res.send('OK'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

test('rejects a request without a token with 401', async () => {
  const response = await request(create_auth_app(), '/ok');
  assert.equal(response.status, 401);
});

test('rejects a malformed token with 401, not 500', async () => {
  const response = await request(create_auth_app(), '/ok?token=abc.def.ghi');
  assert.equal(response.status, 401);
  assert.match(response.body, /Token is not valid/);
});
