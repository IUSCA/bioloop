const { subYears, eachDayOfInterval } = require('date-fns');
const _ = require('lodash/fp');
const data = require('./data');

// generates records to be seeded into the dataset_state table, across the given number of years
function generate_staged_logs(num_years) {
  const end_date = new Date();
  const start_date = subYears(end_date, num_years);

  const { datasets } = data;

  const staging_logs = [];

  eachDayOfInterval({ start: start_date, end: end_date }).forEach((date, i) => {
    // choose a random value (b/w 0 and 10) for number of files staged on any given day
    const num_staged_files = Math.floor(Math.random() * 10);

    _.range(0, num_staged_files).forEach((j) => {
      staging_logs.push({
        state: `${i}-${j}`,
        timestamp: date,
        metadata: {},
        dataset_id: datasets[Math.floor(Math.random() * datasets.length)].id,
      });
    });
  });

  return staging_logs;
}

module.exports = {
  generate_staged_logs,
};
