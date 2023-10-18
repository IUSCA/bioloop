const { PrismaClient } = require('@prisma/client');
const _ = require('lodash/fp');
const dayjs = require('dayjs');

const { generate_date_range } = require('../../src/services/datetime');
const data = require('./data');

const prisma = new PrismaClient();

// generates records to be seeded into the stage_request_log table, across the given number of years
async function generate_stage_request_logs(num_years) {
  const end_date = new Date();
  const start_date = dayjs(end_date).subtract(num_years, 'year').toDate();

  const { datasets } = data;
  const users = await prisma.user.findMany();

  const stage_request_logs = [];
  generate_date_range(start_date, end_date).forEach((date) => {
    // choose a random value (b/w 0 and 10) for number of files staged on any given day
    const num_staged_files = Math.floor(Math.random() * 10);

    _.range(0, num_staged_files).forEach(() => {
      stage_request_logs.push({
        timestamp: date,
        dataset_id: datasets[Math.floor(Math.random() * datasets.length)].id,
        user_id: users[Math.floor(Math.random() * users.length)].id,
      });
    });
  });

  return stage_request_logs;
}

module.exports = {
  generate_stage_request_logs,
};
