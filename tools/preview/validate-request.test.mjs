import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, validateRequest } from './validate-request.mjs';

const sha = 'a'.repeat(40);
const env = { PR_NUMBER: '42', DURATION: '60', GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'IUSCA/bioloop', GITHUB_ACTOR: 'reviewer', PREVIEW_ALLOWED_EMAILS: 'reviewer@example.com' };
function fixture(overrides = {}) {
  const pr = { state: 'open', base: { ref: 'main', repo: { full_name: env.GITHUB_REPOSITORY } }, head: { sha, repo: { full_name: 'contributor/bioloop' } } };
  const run = { id: 100, workflow_id: 10, event: 'pull_request', head_sha: sha, repository: { full_name: env.GITHUB_REPOSITORY }, pull_requests: [{ number: 42 }], status: 'completed', conclusion: 'success' };
  let prReads = 0;
  return async path => {
    if (path.endsWith('/permission')) return { permission: overrides.permission || 'write' };
    if (path.includes('/files?')) return overrides.files || [{ filename: 'ui/src/example.vue' }];
    if (path.endsWith('/pulls/42')) {
      prReads += 1;
      return { ...pr, ...overrides.pr, head: { ...pr.head, sha: prReads > 1 && overrides.race ? 'b'.repeat(40) : sha } };
    }
    if (path.endsWith('/ci.yml')) return { id: 10 };
    if (path.includes('/runs?')) return { workflow_runs: overrides.runs || [{ ...run, ...overrides.run }] };
    throw new Error(`Unexpected request: ${path}`);
  };
}
test('validates a fork PR with exact-SHA CI and a trusted execution workflow', async () => {
  assert.equal((await validateRequest(env, fixture())).sha, sha);
});
test('rejects malformed inputs and untrusted execution refs', () => {
  for (const change of [{ PR_NUMBER: '42;whoami' }, { DURATION: '999' }, { GITHUB_REF: 'refs/heads/contributor' }, { PREVIEW_ALLOWED_EMAILS: '*@example.com' }, { PREVIEW_ALLOWED_EMAILS: '' }]) {
    assert.throws(() => parseRequest({ ...env, ...change }));
  }
});
test('rejects unauthorized actors and wrong PR targets', async () => {
  await assert.rejects(validateRequest(env, fixture({ permission: 'read' })));
  await assert.rejects(validateRequest(env, fixture({ pr: { state: 'closed' } })));
  await assert.rejects(validateRequest(env, fixture({ pr: { base: { ref: 'release' } } })));
});
test('rejects changed harnesses, including renamed files', async () => {
  for (const files of [[{ filename: 'tools/preview/run.sh' }], [{ filename: 'other.yml', previous_filename: '.github/workflows/ci.yml' }]]) {
    await assert.rejects(validateRequest(env, fixture({ files })));
  }
});
test('rejects missing, failed, stale, unrelated, and pending CI', async () => {
  for (const change of [{ runs: [] }, { run: { conclusion: 'failure' } }, { run: { head_sha: 'b'.repeat(40) } }, { run: { pull_requests: [{ number: 99 }] } }, { run: { status: 'in_progress' } }, { run: { workflow_id: 99 } }]) {
    await assert.rejects(validateRequest(env, fixture(change)));
  }
});
test('does not accept an older successful run over a newer failed run', async () => {
  const base = { workflow_id: 10, event: 'pull_request', head_sha: sha, repository: { full_name: env.GITHUB_REPOSITORY }, pull_requests: [{ number: 42 }], status: 'completed' };
  await assert.rejects(validateRequest(env, fixture({ runs: [{ ...base, id: 100, conclusion: 'success' }, { ...base, id: 101, conclusion: 'failure' }] })));
});
test('rejects a PR updated during validation', async () => {
  await assert.rejects(validateRequest(env, fixture({ race: true })));
});
