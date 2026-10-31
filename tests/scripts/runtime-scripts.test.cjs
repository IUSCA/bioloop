// Regression tests for E2E teardown, API environment loading, and seed prerequisites.
// All commands run against temporary fixtures; no Docker services are started.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

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

// Run the entrypoint's actual seed sections without enabling `set -e` in tests.
// Only npx is mocked; database access and application startup never occur.
const entrypoint = readFileSync(path.join(root, 'api/bin/entrypoint.sh'), 'utf8');
const seedBlock = entrypoint.match(/^if \[ "\$\{NODE_ENV\}" = "ci" \]; then[\s\S]*?^fi$/m)?.[0];
const recoverySeedBlock = entrypoint.match(
  /^    rm -f \.db_seeded\n[\s\S]*?^    echo "Re-seed complete\. Retrying APP_API_TOKEN generation\.\.\."$/m,
)?.[0];
assert.ok(seedBlock, 'The API entrypoint must seed CI and uninitialized databases');
assert.ok(recoverySeedBlock, 'The API entrypoint must handle stale seed markers');

function runSeedBlock(block, directory, mode, seedStatus) {
  return spawnSync('bash', ['-c', `
    NODE_ENV="$1"
    MOCK_SEED_STATUS="$2"
    npx() { printf 'SEED_CALLED\\n'; return "$MOCK_SEED_STATUS"; }
    ${block}
    printf 'AFTER_SEED\\n'
  `, 'seed-test', mode, String(seedStatus)], {
    cwd: directory,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
}

for (const [mode, seedStatus, existingMarker, expectedStatus, seedCalled, finalMarker] of [
  ['ci', 0, true, 0, true, true],
  ['ci', 23, true, 1, true, true],
  ['docker', 0, false, 0, true, true],
  ['docker', 23, false, 1, true, false],
  ['docker', 23, true, 0, false, true],
]) {
  test(`${mode} seed exit ${seedStatus}, existing marker ${existingMarker}: startup exit ${expectedStatus}`, (t) => {
    const directory = temporaryDirectory(t);
    const marker = path.join(directory, '.db_seeded');
    if (existingMarker) writeFileSync(marker, 'existing seed marker');

    const result = runSeedBlock(seedBlock, directory, mode, seedStatus);
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.equal(result.stdout.includes('SEED_CALLED'), seedCalled);
    assert.equal(result.stdout.includes('AFTER_SEED'), expectedStatus === 0);
    assert.equal(existsSync(marker), finalMarker);
    if (expectedStatus !== 0) {
      assert.match(result.stderr, /ERROR: prisma db seed failed/);
      assert.doesNotMatch(result.stdout, /prisma db seed done/);
    }
  });
}

for (const seedStatus of [0, 23]) {
  test(`stale-marker recovery with seed exit ${seedStatus} only continues after success`, (t) => {
    const directory = temporaryDirectory(t);
    const marker = path.join(directory, '.db_seeded');
    writeFileSync(marker, 'stale seed marker');

    const result = runSeedBlock(recoverySeedBlock, directory, 'docker', seedStatus);
    const succeeded = seedStatus === 0;
    assert.equal(result.status, succeeded ? 0 : 1, result.stderr);
    assert.equal(result.stdout.includes('SEED_CALLED'), true);
    assert.equal(result.stdout.includes('AFTER_SEED'), succeeded);
    assert.equal(result.stdout.includes('Re-seed complete.'), succeeded);
    assert.equal(existsSync(marker), succeeded);
    if (!succeeded) assert.match(result.stderr, /ERROR: prisma db seed failed/);
  });
}

// A fresh database has no login-created role users when fixture seeding runs.
const seedSource = readFileSync(path.join(root, 'api/prisma/seed.js'), 'utf8');
const notificationUserSeeder = seedSource.match(/^async function seedNotificationUsers\(\) \{[\s\S]*?^\}/m)?.[0];
assert.ok(notificationUserSeeder, 'Notification recipients must be prepared before fixture seeding');
const seedData = require('../../api/prisma/seed_data/data');

function prepareNotificationUsers(prisma) {
  return runInNewContext(`${notificationUserSeeder}\nseedNotificationUsers();`, { prisma, data: seedData });
}

test('fixture recipients exist before notification seeding with their expected roles', async () => {
  const created = [];
  const users = new Map();
  const prisma = { user: { upsert: async ({ where, create }) => {
    assert.equal(where.username, create.username);
    const user = JSON.parse(JSON.stringify(create));
    users.set(user.username, user);
    created.push(user);
    return user;
  } } };

  const usernames = await prepareNotificationUsers(prisma);
  assert.deepEqual(Array.from(usernames), ['e2eAdmin', 'e2eOperator', 'e2eUser']);
  assert.deepEqual(created.map((u) => u.user_role.create[0].role_id), [1, 2, 3]);
  for (const username of usernames) {
    assert.equal(users.get(username).email, `${username}@iu.edu`);
    assert.equal(users.get(username).cas_id, username);
  }
  assert.match(seedSource, /const notificationUsers = await seedNotificationUsers\(\);\s+runNotificationSeedScript\(notificationUsers\);/);
});

test('repeated fixture-user seeding preserves existing users and sample IDs', async () => {
  const admin = { id: 2, username: 'e2eAdmin', name: 'Existing Admin' };
  const sampleUser = { id: 6, username: 'user-0', name: 'Existing sample user' };
  const users = new Map([[admin.username, admin], [sampleUser.username, sampleUser]]);
  let created = 0;
  const prisma = { user: { upsert: async ({ where, update, create }) => {
    assert.deepEqual(Object.keys(update), []);
    if (!users.has(where.username)) {
      created += 1;
      users.set(where.username, { id: 100 + created, ...JSON.parse(JSON.stringify(create)) });
    }
    return users.get(where.username);
  } } };

  await prepareNotificationUsers(prisma);
  await prepareNotificationUsers(prisma);
  assert.equal(created, 2);
  assert.equal(users.get('e2eAdmin'), admin);
  assert.equal(users.get('user-0'), sampleUser);
});

test('fixture-user preparation failures propagate instead of being ignored', async () => {
  const prisma = { user: { upsert: async () => { throw new Error('database unavailable'); } } };
  await assert.rejects(prepareNotificationUsers(prisma), /database unavailable/);
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
