module.exports.run = async function run(logger) {
  logger.info('Example Task is running');
  // Your task logic here
  try {
    // Simulate some work
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
    throw new Error('Simulated error for demonstration purposes');
    // logger.info('Example Task completed successfully');
  } catch (error) {
    logger.error(error, 'Example Task failed');
  }
};
