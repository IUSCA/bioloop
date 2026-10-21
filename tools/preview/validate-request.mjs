import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function parseRequest(env) {
  assert.match(env.PR_NUMBER || '', /^[1-9][0-9]{0,8}$/, 'Invalid PR number');
  assert.ok(['30', '60', '120'].includes(env.DURATION), 'Invalid duration');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Run the trusted workflow from main');
  const emails = (env.PREVIEW_ALLOWED_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
  assert.ok(emails.length > 0 && emails.length <= 20, 'Configure PREVIEW_ALLOWED_EMAILS');
  for (const email of emails) {
    assert.match(email, /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, 'Use specific email addresses, without wildcards');
  }
  assert.match(env.GITHUB_REPOSITORY || '', /^[\w.-]+\/[\w.-]+$/);
  return { pr: Number(env.PR_NUMBER), duration: Number(env.DURATION), emails: emails.join(',') };
}

export async function validateRequest(env, api) {
  const input = parseRequest(env);
  const repo = env.GITHUB_REPOSITORY;
  const actor = env.GITHUB_TRIGGERING_ACTOR || env.GITHUB_ACTOR;
  assert.match(actor || '', /^[\w-]+$/);
  const permission = await api(`/repos/${repo}/collaborators/${actor}/permission`);
  assert.ok(['admin', 'maintain', 'write'].includes(permission.permission), 'Repository write access required');
  const pr = await api(`/repos/${repo}/pulls/${input.pr}`);
  assert.equal(pr.state, 'open', 'PR must be open');
  assert.equal(pr.base.ref, 'main', 'PR must target main');
  assert.equal(pr.base.repo.full_name, repo);
  assert.match(pr.head.sha, /^[a-f0-9]{40}$/);
  assert.ok(pr.head.repo, 'PR source repository is unavailable');

  // CI definitions on a PR are untrusted. Changes to the check harness require
  // separate maintainer review and merge before this workflow can preview them.
  for (let page = 1; ; page += 1) {
    const files = await api(`/repos/${repo}/pulls/${input.pr}/files?per_page=100&page=${page}`);
    for (const file of files) {
      for (const name of [file.filename, file.previous_filename].filter(Boolean)) {
        assert.ok(!name.startsWith('.github/workflows/') && !name.startsWith('tools/preview/')
          && name !== 'docker-compose-preview.yml', 'Preview/CI harness changes must be reviewed and merged first');
      }
    }
    if (files.length < 100) break;
    assert.ok(page < 30, 'PR is too large to validate safely');
  }
  const workflow = await api(`/repos/${repo}/actions/workflows/ci.yml`);
  const { workflow_runs: runs } = await api(`/repos/${repo}/actions/workflows/${workflow.id}/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`);
  const matching = runs.filter(run => run.workflow_id === workflow.id
    && run.event === 'pull_request' && run.head_sha === pr.head.sha
    && run.repository.full_name === repo
    && run.pull_requests.some(item => item.number === input.pr));
  matching.sort((a, b) => b.id - a.id);
  const run = matching[0];
  assert.ok(run && run.status === 'completed' && run.conclusion === 'success', 'Latest CI must pass for this PR head SHA');
  // Close the validation race; the execution job uses this SHA even if updated later.
  const current = await api(`/repos/${repo}/pulls/${input.pr}`);
  assert.equal(current.state, 'open');
  assert.equal(current.head.sha, pr.head.sha, 'PR changed during validation; start again');
  return { ...input, sha: pr.head.sha, ciRun: run.id };
}

async function main() {
  const env = process.env;
  const api = async path => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    });
    assert.ok(response.ok, `GitHub validation request failed (${response.status})`);
    return response.json();
  };
  const result = await validateRequest(env, api);
  for (const [key, value] of Object.entries(result)) appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`Validated PR #${result.pr} at ${result.sha}, CI run ${result.ciRun}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
