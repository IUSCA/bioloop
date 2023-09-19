const { PrismaClient } = require('@prisma/client');
const { subYears, eachDayOfInterval } = require('date-fns');
const _ = require('lodash/fp');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// generates records to be seeded into the data_access_log table, across the given number of years
async function generate_data_access_logs(num_years) {
  const dataset_files = await prisma.dataset_file.findMany();
  // exclude directories from retrieved files list
  const files = dataset_files.filter((record) => record.filetype === 'file');

  const datasets = await prisma.dataset.findMany();
  const users = await prisma.user.findMany();

  const end_date = new Date();
  const start_date = subYears(end_date, num_years);

  const data_access_logs = [];
  eachDayOfInterval({ start: start_date, end: end_date }).forEach(async (date) => {
    // choose a random value (b/w 0 and 100) for number of files downloaded on any given day
    const num_downloaded_files = Math.floor(Math.random() * 100);

    _.range(0, num_downloaded_files).forEach((i) => {
      // For seeding, it is sufficient to have every 4th download be an 'indirect' download (i.e.
      // accessing entire dataset directly through Slate-Scratch, instead of downloading individual
      // files using the web browser)
      const is_direct_download = i % 4 !== 0;
      data_access_logs.push({
        timestamp: date,
        access_type: is_direct_download ? 'BROWSER' : 'SLATE_SCRATCH',
        file_id: is_direct_download
          ? files[Math.floor(Math.random() * files.length)].id
          : null,
        dataset_id: is_direct_download
          ? null
          : datasets[Math.floor(Math.random() * datasets.length)].id,
        user_id: users[Math.floor(Math.random() * users.length)].id,
      });
    });
  });

  return data_access_logs;
}

module.exports = {
  generate_data_access_logs,
};
