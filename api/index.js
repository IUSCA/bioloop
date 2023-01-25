require('dotenv').config();
require('./db');
const config = require('config');
const app = require('./app');
const logger = require('./logger');

const port = config.get('express.port');
const host = config.get('express.host')
app.listen(port, () => {
  /* eslint-disable no-console */
  logger.info(`Listening: http://${host}:${port}`);
  /* eslint-enable no-console */
});
