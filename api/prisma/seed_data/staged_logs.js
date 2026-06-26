const _ = require('lodash/fp');
const dayjs = require('dayjs');
const { generate_date_range } = require('../../src/services/datetime');

// generates records to be seeded into the dataset_state table, across the given number of years
function generate_staged_logs(num_years, dataset_ids) {
  const end_date = new Date();
  const start_date = dayjs(end_date).subtract(num_years, 'year').toDate();

  const staging_logs = [];

  generate_date_range(start_date, end_date).forEach((date) => {
    // choose a random value (b/w 0 and 2) for number of files staged on any given day
    const num_staged_files = Math.floor(Math.random() * 2);

    _.range(0, num_staged_files).forEach(() => {
      staging_logs.push({
        state: 'STAGED',
        timestamp: date,
        metadata: {},
        dataset_id: dataset_ids[Math.floor(Math.random() * dataset_ids.length)],
      });
    });
  });

  return staging_logs;
}

module.exports = {
  generate_staged_logs,
};
