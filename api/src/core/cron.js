/* eslint-disable no-unused-vars */
/* eslint-disable global-require */
const cron = require('node-cron');
const { createTaskLogger } = require('./logger');

function registerCronJobs() {
  // Example: Schedule a task to run every minute
  // cron.schedule('* * * * *', () => {
  //   const task = require('../cron/exampleTask.cron');
  //   const taskLogger = createTaskLogger('exampleTask');
  //   task.run(taskLogger);
  // });
}

module.exports = registerCronJobs;
