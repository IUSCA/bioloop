const dayjs = require('dayjs');

/**
 *
 * @param {Date} start       Date to start the range at (inclusive)
 * @param {Date} end         Date to end the range at (inclusive)
 * @param {*} [stepBy = 1]   Amount to step by between each date
 * @param {*} [unit = 'day'] Time unit used for stepping // https://day.js.org/docs/en/manipulate/add#list-of-all-available-units
 * @returns                  Array of Dates generated based on parameters
 */
function generate_date_range(start, end, stepBy = 1, unit = 'day') {
  const ranges = [];
  let currentDate = dayjs(start);
  const endDate = dayjs(end);

  while (currentDate.isBefore(endDate) || currentDate.isSame(endDate)) {
    ranges.push(currentDate.toDate());
    currentDate = currentDate.add(stepBy, unit);
  }

  return ranges;
}

module.exports = {
  generate_date_range,
};
