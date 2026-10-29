// Regression tests for E2E teardown and pre-install API environment loading.
// All commands run against temporary fixtures; no Docker services are started.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const loader = path.join(root, 'api/bin/runtime_env.sh');

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'bioloop-runtime-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function loadEnvironment(file, composeMode = '', extra = '') {
  return spawnSync('bash', ['-c', `
    set -euo pipefail
    source "$1"
    load_runtime_env "$3" "$2"
    ${extra}
    node -e 'process.stdout.write(JSON.stringify(process.env))'
  `, 'runtime-env-test', loader, file, composeMode], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
}

test('dotenv values preserve whitespace, quoting, punctuation, and multiline data', (t) => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, '.env');
  writeFileSync(file, [
    '# Comments and blank lines are ignored',
    '',
    'PLAIN=hello world',
    'SINGLE=\'it is "quoted"\'',
    'DOUBLE="it\'s quoted"',
    'SECRET="!@&;$name # literal"',
    'URL="postgres://user:p@ss!@host/db?one=1&two=2"',
    'EMPTY=',
    'INLINE=value # trailing comment',
    'export EXPORTED=yes',
    'MULTILINE="first line\nsecond line\n"',
  ].join('\r\n'));

  const result = loadEnvironment(file);
  assert.equal(result.status, 0, result.stderr);
  const env = JSON.parse(result.stdout);
  assert.equal(env.PLAIN, 'hello world');
  assert.equal(env.SINGLE, 'it is "quoted"');
  assert.equal(env.DOUBLE, "it's quoted");
  assert.equal(env.SECRET, '!@&;$name # literal');
  assert.equal(env.URL, 'postgres://user:p@ss!@host/db?one=1&two=2');
  assert.equal(env.EMPTY, '');
  assert.equal(env.INLINE, 'value');
  assert.equal(env.EXPORTED, 'yes');
  assert.equal(env.MULTILINE, 'first line\nsecond line\n');
});

test('dotenv command substitutions stay literal and do not execute', (t) => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, '.env');
  const dollarMarker = path.join(directory, 'dollar-executed');
  const backtickMarker = path.join(directory, 'backtick-executed');
  const dollarValue = `$(touch ${dollarMarker})`;
  const backtickValue = `\`touch ${backtickMarker}\``;
  writeFileSync(file, `DOLLAR="${dollarValue}"\nBACKTICK="${backtickValue}"\n`);

  const result = loadEnvironment(file);
  assert.equal(result.status, 0, result.stderr);
  const env = JSON.parse(result.stdout);
  assert.equal(env.DOLLAR, dollarValue);
  assert.equal(env.BACKTICK, backtickValue);
  assert.equal(existsSync(dollarMarker), false);
  assert.equal(existsSync(backtickMarker), false);
});

test('Compose NODE_ENV wins on both loads while refreshed values are exported', (t) => {
  const file = path.join(temporaryDirectory(t), '.env');
  writeFileSync(file, 'NODE_ENV=docker\nREFRESHED=old\n');
  const result = loadEnvironment(file, 'ci', `
    [[ "$NODE_ENV" == ci && "$REFRESHED" == old ]]
    printf 'NODE_ENV=development\nREFRESHED="new value"\n' > "$2"
    load_runtime_env "$3" "$2"
  `);
  assert.equal(result.status, 0, result.stderr);
  const env = JSON.parse(result.stdout);
  assert.equal(env.NODE_ENV, 'ci');
  assert.equal(env.REFRESHED, 'new value');
});

test('dotenv NODE_ENV is retained when Compose does not select a mode', (t) => {
  const file = path.join(temporaryDirectory(t), '.env');
  writeFileSync(file, 'NODE_ENV=docker\n');
  const result = loadEnvironment(file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).NODE_ENV, 'docker');
});

test('empty or absent dotenv files do not fail', (t) => {
  const directory = temporaryDirectory(t);
  for (const filename of ['empty.env', 'absent.env']) {
    const file = path.join(directory, filename);
    if (filename === 'empty.env') writeFileSync(file, '');
    const result = loadEnvironment(file, 'ci');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).NODE_ENV, 'ci');
  }
});

test('a parser error is not silently lost by the shell process substitution', (t) => {
  const file = path.join(temporaryDirectory(t), '.env');
  writeFileSync(file, 'BROKEN="before\0after"\n');
  const result = loadEnvironment(file, 'ci');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Failed to load the runtime environment/);
  assert.equal(result.stdout, '');
});

// Exercise the exact EXIT-trap function without running the rest of the stack.
const runner = readFileSync(path.join(root, 'bin/test_ui_e2e.sh'), 'utf8');
const cleanup = runner.match(/^cleanup\(\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(cleanup, 'The E2E runner must define its cleanup function');

for (const [originalStatus, teardownStatus, expectedStatus] of [
  [0, 0, 0],
  [7, 0, 7],
  [0, 9, 1],
  [7, 9, 7],
]) {
  test(`teardown ${teardownStatus} preserves exit ${originalStatus} and removes TLS files`, (t) => {
    const directory = temporaryDirectory(t);
    writeFileSync(path.join(directory, 'cert.pem'), 'test certificate');
    writeFileSync(path.join(directory, 'key.pem'), 'test key');
    const result = spawnSync('bash', ['-c', `
      set -euo pipefail
      E2E_TLS_CERT_DIR="$1"
      COMPOSE_FILE=unused-test-compose.yml
      MOCK_DOCKER_STATUS="$3"
      docker() { return "$MOCK_DOCKER_STATUS"; }
      ${cleanup}
      trap cleanup EXIT
      exit "$2"
    `, 'cleanup-test', directory, String(originalStatus), String(teardownStatus)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.equal(existsSync(directory), false, 'TLS cleanup must still run');
  });
}
