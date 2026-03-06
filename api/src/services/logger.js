const winston = require('winston');
const { format } = require('winston');
const config = require('config');

const logger = winston.createLogger({
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    // format.json(),
    // eslint-disable-next-line max-len
    // format.printf((info) => `${info.timestamp} ${info.level}:
    // ${info.message}${info.splat !== undefined ? `${info.splat}` : ' '}`),
    format.printf(({
      timestamp, level, message, ...meta
    }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    }),
  ),
  transports: [
    new (winston.transports.Console)({
      level: config.get('logger.level'),
    }),
  ],
});
module.exports = logger;
