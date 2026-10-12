const path = require('path');

// Never allow integration tests to pick up a developer's .env or database.
if (!process.env.API_TEST_DATABASE_URL
  || process.env.DATABASE_URL !== process.env.API_TEST_DATABASE_URL
  || process.env.NODE_ENV !== 'test') {
  throw new Error('API Jest tests require the isolated test database; use bin/test_api_jest.sh');
}

global.__basedir = path.join(__dirname, '..');
require('module-alias/register');
const prisma = require('../src/db');

afterAll(async () => {
  await prisma.$disconnect();
});
