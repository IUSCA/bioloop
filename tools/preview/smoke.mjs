// Runs inside the API container, against the same nginx routes used by browsers.
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const origin = 'http://ui';
async function request(path, { token, json, status = 200, ...options } = {}) {
  const response = await fetch(new URL(path, origin), {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    ...(json ? { body: JSON.stringify(json) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, status, `${options.method || 'GET'} ${path}: unexpected status`);
  return response;
}

await request('/');
await request('/api/health');
await request('/data/preview-hello.txt', { status: 404 });
const tokens = {};
for (const role of ['admin', 'operator', 'user']) {
  const response = await request('/api/auth/cas/verify', { method: 'POST', json: { ticket: role } });
  const session = await response.json();
  assert.ok(session.token && session.profile.roles.includes(role), `Demo ${role} login failed`);
  tokens[role] = session.token;
}
await request('/api/datasets?limit=1', { token: tokens.admin });

const registration = await (await request('/api/datasets/uploads', {
  token: tokens.admin, method: 'POST', json: { type: 'DATA_PRODUCT', name: `preview-smoke-${Date.now()}` },
})).json();
const id = registration.dataset.id;
const payload = Buffer.from('BioLoop preview TUS and local workflow round trip\n');
const metadata = { dataset_id: String(id), filename: 'preview.txt', selection_mode: 'files', relative_path: 'preview.txt' };
const created = await request('/api/uploads/files', {
  token: tokens.admin, method: 'POST', status: 201,
  headers: { 'Tus-Resumable': '1.0.0', 'Upload-Length': String(payload.length), 'Upload-Metadata': Object.entries(metadata).map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`).join(',') },
});
const location = new URL(created.headers.get('location'), origin);
assert.equal(location.origin, origin, 'TUS must return a same-origin location');
assert.ok(location.pathname.startsWith('/api/uploads/files/'));
const tusPath = location.pathname;
await request(tusPath, { token: tokens.admin, method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' } });
await request(tusPath, {
  token: tokens.admin, method: 'PATCH', status: 204, body: payload,
  headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
});
await request(`/api/datasets/uploads/${id}/complete`, {
  token: tokens.admin, method: 'POST', json: { process_id: tusPath.split('/').pop() },
});

let dataset;
const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  dataset = await (await request(`/api/datasets/${id}?files=true`, { token: tokens.admin })).json();
  if (dataset.is_staged && dataset.metadata?.stage_alias && dataset.files?.length) break;
  await sleep(3000);
}
assert.ok(dataset.is_staged && dataset.metadata?.stage_alias && dataset.files?.length, 'Local upload/archive/stage workflow did not complete within 3 minutes');
// The dataset summary deliberately returns only paths/checksums. The browser
// file-list endpoint supplies the IDs required by the download-token endpoint.
const files = await (await request(`/api/datasets/${id}/files`, { token: tokens.admin })).json();
const file = files.find(item => item.path === 'preview.txt');
assert.ok(file, 'Inspected uploaded file is missing');
const download = await (await request(`/api/datasets/download/${id}?file_id=${file.id}`, { token: tokens.admin })).json();
const url = new URL(download.url);
assert.ok(url.pathname.startsWith('/download/'));
let received;
for (let attempt = 0; attempt < 10; attempt += 1) {
  received = await fetch(new URL(url.pathname, origin), {
    headers: { Authorization: `Bearer ${download.bearer_token}` }, signal: AbortSignal.timeout(10_000),
  });
  if (received.status !== 404) break;
  await received.arrayBuffer();
  await sleep(1000);
}
assert.equal(received.status, 200, 'Authorized staged download did not become available');
assert.deepEqual(Buffer.from(await received.arrayBuffer()), payload, 'Downloaded bytes differ from uploaded bytes');
await request('/download/not-the-authorized-file.txt', { token: download.bearer_token, status: 403 });
console.log('Smoke passed: three demo roles, TUS upload, local Celery archive/stage, authorized byte-for-byte download, denied direct/scoped access.');
