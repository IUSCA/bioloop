const path = require('path');

// __basedir is the path of root directory
// has same value when used in any js file in this project
global.__basedir = path.join(__dirname, '..');

// Load .env first so production values take precedence, then load .env.default
// as fallback for any vars not present in .env. 
// 
// dotenv v8 does not override already-set env vars, so this achieves the
//  desired override semantics without needing a newer dotenv version.
require('dotenv').config();
require('dotenv').config({ path: '.env.default' });


// require('./db');
const config = require('config');
const app = require('./app');
const logger = require('./services/logger');

const port = config.get('express.port');
const host = config.get('express.host');
const server = app.listen(port, () => {
  logger.info(`Listening: http://${host}:${port}`);
});

const shutdown = () => {
  logger.warn('server: closing');
  server.close((err) => {
    if (err) {
      logger.error('server: closed with ERROR', err);
      process.exit(1);
    }
    logger.warn('server: closed');
    process.exit();
  });
};

process.on('SIGINT', () => {
  logger.warn('process received SIGINT');
  shutdown();
});

process.on('SIGTERM', () => {
  logger.warn('process received SIGTERM');
  shutdown();
});
