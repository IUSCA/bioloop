const assert = require('node:assert/strict');
const test = require('node:test');

const download_router = require('../src/routes/download');
const { create_app, request } = require('./helpers');

const app = create_app(download_router);

test('authorizes a single-segment bundle path', async () => {
  const response = await request(
    app,
    '/download/bundle.tar',
    'download_file:/bundle.tar',
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers['x-accel-redirect'], '/data/bundle.tar');
});

test('authorizes an alias and filename path', async () => {
  const response = await request(
    app,
    '/download/alias/experiment.xenium',
    'download_file:/alias/experiment.xenium',
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers['x-accel-redirect'], '/data/alias/experiment.xenium');
});

test('handles encoded slashes, nested directories, and spaces consistently', async () => {
  const response = await request(
    app,
    '/download/alias%2Fresults%2Fsummary%20report.html',
    'download_file:/alias/results/summary%20report.html',
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers['x-accel-redirect'],
    '/data/alias/results/summary%20report.html',
  );
});

test('rejects a token whose path does not match the request', async () => {
  const response = await request(
    app,
    '/download/alias/requested.txt',
    'download_file:/alias/other.txt',
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers['x-accel-redirect'], undefined);
});

test('rejects a request without a download scope', async () => {
  const response = await request(app, '/download/alias/file.txt');

  assert.equal(response.status, 403);
  assert.equal(response.headers['x-accel-redirect'], undefined);
});

test('rejects traversal even when the token contains the same path', async () => {
  const response = await request(
    app,
    '/download/alias/%2E%2E/secret.txt',
    'download_file:/alias/../secret.txt',
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers['x-accel-redirect'], undefined);
});

test('rejects malformed URL encoding', async () => {
  const response = await request(
    app,
    '/download/alias/%E0%A4%A',
    'download_file:/alias/file.txt',
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers['x-accel-redirect'], undefined);
});
