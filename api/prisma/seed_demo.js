/* eslint-disable no-console */
require('module-alias/register');
// Loaded before `config`, which reads `mode` from NODE_ENV. `npm run` does not load `.env`;
// only the Prisma CLI does, for the seed it runs itself.
require('dotenv-safe').config({ example: '.env.default' });
const config = require('config');
const { PrismaClient, SUBJECT_TYPE, RESOURCE_TYPE } = require('@prisma/client');

const { seedBaseline } = require('./seed_baseline');
const { seedDemoWorld } = require('./seed_data/demo_world');

/**
 * Seeds a database for a live demo: the baseline every deployment needs, then the demo world,
 * and nothing else. Run it on an empty database, after `prisma migrate reset --skip-seed`.
 * Never run it on top of `npm run seed`: the demo cast reuses the flows world's usernames.
 *
 * @see prisma/seed_data/demo_world.js
 */
if (config.get('mode') === 'production') {
  console.error('The demo seed must not run in production mode.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  await seedBaseline(prisma);
  const counts = await seedDemoWorld(prisma, { SUBJECT_TYPE, RESOURCE_TYPE });
  console.log('seeded the demo world:', counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
