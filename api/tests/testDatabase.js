/**
 * Points this process at the isolated test database.
 *
 * The suites write many rows per run, and the access-model harness writes thousands, so they
 * cannot share the development database the running API reads. Requiring this module sets
 * `DATABASE_URL` to `<DATABASE_DB>_test` on the same server, before `src/db.js` or a seed opens
 * a Prisma client. `src/db.js` loads `.env` through dotenv-safe, which never overrides a
 * variable already set, so the override holds.
 *
 * Jest loads it through `setupFiles`, once per test file. `npm run test:db:setup` loads it
 * before migrating and seeding. `tests/request.js`, the client for the running API on port
 * 3030, calls `useDevelopmentDatabase`, because the API reads the development database.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The isolated test database
 */

const path = require('path');

const API_ROOT = path.join(__dirname, '..');

require('dotenv-safe').config({
  path: path.join(API_ROOT, '.env'),
  example: path.join(API_ROOT, '.env.default'),
});

const {
  DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_DB, DATABASE_SCHEMA,
} = process.env;

const missing = Object.entries({
  DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_DB, DATABASE_SCHEMA,
}).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  throw new Error(`test database: ${missing.join(', ')} not set in api/.env`);
}

// Idempotent: a second require in the same process must not append a second suffix.
const TEST_DATABASE_DB = DATABASE_DB.endsWith('_test') ? DATABASE_DB : `${DATABASE_DB}_test`;

const DEVELOPMENT_DATABASE_DB = TEST_DATABASE_DB.replace(/_test$/, '');

function point(databaseName) {
  const user = encodeURIComponent(DATABASE_USER);
  const password = encodeURIComponent(DATABASE_PASSWORD);
  const server = `${DATABASE_HOST}:${DATABASE_PORT}`;
  process.env.DATABASE_DB = databaseName;
  process.env.DATABASE_URL = `postgresql://${user}:${password}@${server}/${databaseName}?schema=${DATABASE_SCHEMA}`;
}

point(TEST_DATABASE_DB);

/**
 * Points this test file back at the development database, for a suite that calls the running
 * API and so must write the rows the API reads. Call it before requiring anything that opens a
 * Prisma client. The next test file starts on the test database again.
 */
function useDevelopmentDatabase() {
  point(DEVELOPMENT_DATABASE_DB);
}

module.exports = { TEST_DATABASE_DB, useDevelopmentDatabase };
