const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const download_root = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-download-'));
const nested_dir = path.join(download_root, 'alias', 'results');
fs.mkdirSync(nested_dir, { recursive: true });
fs.writeFileSync(path.join(nested_dir, 'summary report.txt'), 'download contents');
process.env.NODE_CONFIG = JSON.stringify({ download_path: download_root });

const download_router = require('../src/routes/download');
const { create_app, request } = require('./helpers');

const app = create_app(download_router);

test.after(() => fs.rmSync(download_root, { force: true, recursive: true }));

test('streams an authorized nested file from the configured root', async () => {
  const response = await request(
    app,
    '/download/alias/results/summary%20report.txt',
    'download_file:/alias/results/summary%20report.txt',
  );

  assert.equal(response.status, 200);
  assert.equal(response.body, 'download contents');
  assert.equal(response.headers['x-accel-redirect'], undefined);
});

test('does not stream a traversal path', async () => {
  const response = await request(
    app,
    '/download/alias/%2E%2E/outside.txt',
    'download_file:/alias/../outside.txt',
  );

  assert.equal(response.status, 403);
});
