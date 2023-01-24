require('dotenv').config();
const config = require('config');
const app = require('./app');
const logger = require('./logger');

const port = config.get('express.port');
app.listen(port, () => {
  /* eslint-disable no-console */
  logger.info(`Listening: http://localhost:${port}`);
  /* eslint-enable no-console */
});
