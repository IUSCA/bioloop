# Scheduling Tasks

The cron task scheduling feature allows you to define and execute recurring tasks at specified intervals in the primary process of the cluster. This feature is useful for automating maintenance, cleanup, and other background operations in your application.

## How It Works

The `registerCronJobs` function in the `/api/src/core/cron.js` file is responsible for registering all cron jobs. It uses the `node-cron` library to define and schedule tasks. Each task is implemented as a separate module, ensuring modularity and reusability.

### Usage Instructions

1. **Define a New Task**:
   - Create a new file in the `cron` directory (e.g., `exampleTask.cron.js`).
   - Export a `run` async function that contains the task logic.

   ```javascript
   module.exports.run = async (logger) => {
     logger.info('Running example task...');
     // Task logic here
   };
   ```

2. **Register the Task**:
   - Open the `cron.js` file.
   - Use the `cron.schedule` method to define the schedule and link the task.

   ```javascript
   // filepath: /Users/deduggi/Documents/SCA/bioloop/api/src/core/cron.js
   const cron = require('node-cron');
   const { createTaskLogger } = require('./logger');

   function registerCronJobs() {
     cron.schedule('* * * * *', () => {
       const task = require('../cron/exampleTask.cron');
       const taskLogger = createTaskLogger('exampleTask');
       task.run(taskLogger);
     });
   }

   module.exports = registerCronJobs;
   ```

Cron tasks are registered using the `beforeApplicationFork` lifecycle hook ensuring that they run in the primary process of the cluster. 

The `createTaskLogger` function creates a logger instance for each task, allowing you to log task-specific messages. The logger is passed to the task function as an argument. The log file for each task is stored in the `logs` directory with the task name as the filename.

### Best Practices

- Use meaningful names for tasks and loggers to simplify debugging.
- Avoid long-running tasks in cron jobs; delegate heavy processing to worker queues if needed.
- Test tasks thoroughly to ensure they don’t interfere with application performance.

