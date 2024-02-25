const path = require('path');

const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
const dayjs = require('dayjs');
const config = require('config');

const { normalize_name } = require('../../src/services/project');
const { random_files } = require('../seed_data/random_paths');
const { generate_data_access_logs } = require('../seed_data/data_access_logs');
const { generate_staged_logs } = require('../seed_data/staged_logs');
const { generate_stage_request_logs } = require('../seed_data/stage_request_logs');
const { generate_date_range } = require('../../src/services/datetime');
const datasetService = require('../../src/services/dataset');
const { readUsersFromJSON } = require('../../src/utils');
const data = require('./data');

global.__basedir = path.join(__dirname, '..');

const prisma = new PrismaClient();

if (['production'].includes(config.get('mode'))) {
  // exit if in production mode
  console.error('Seed script should not be run in production mode. Run node src/scripts/init_prod_users.js instead.');
  process.exit(1);
}

async function main() {
  // create dataset_file_type
  await prisma.dataset_file_type.deleteMany();
  await prisma.dataset_file_type.createMany({ data: data.dataset_file_types });
}

main()
  .then(() => {
    prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
