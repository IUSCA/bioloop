// __basedir is the path of root directory
// has same value when used in any js file in this project
global.__basedir = __dirname;

require('dotenv-safe').config();
require('./db');
const config = require('config');
const app = require('./app');
const logger = require('./services/logger');

const port = config.get('express.port');
const host = config.get('express.host');
app.listen(port, () => {
  /* eslint-disable no-console */
  logger.info(`Listening: http://${host}:${port}`);
  /* eslint-enable no-console */
});
