/**
 * Applies migrations to the isolated test database and seeds it.
 *
 *   npm run test:db:setup
 *
 * Both steps leave existing data in place. Dropping the database is `prisma migrate reset`,
 * run by a person against `<DATABASE_DB>_test` after requiring `tests/testDatabase.js`.
 *
 * @see tests/testDatabase.js
 */

const { execSync } = require('child_process');
const path = require('path');

const { TEST_DATABASE_DB } = require('./testDatabase');

const run = (command) => execSync(command, {
  cwd: path.join(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
});

// eslint-disable-next-line no-console
console.log(`migrating and seeding ${TEST_DATABASE_DB}`);
run('npx prisma migrate deploy');
run('npx prisma db seed');
