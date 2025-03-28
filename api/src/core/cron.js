function registerCronJobs() {
  // eslint-disable-next-line global-require, no-unused-vars
  const cron = require('node-cron');

  // Example: Schedule a task to run every minute
  // cron.schedule('* * * * *', () => {
  //   console.log('Running a task every minute');
  // });
}

module.exports = {
  registerCronJobs,
};
