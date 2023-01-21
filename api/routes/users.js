const express = require('express');
const logger = require('../logger');

const router = express.Router();

router.get('/', (req, res, next) => {
  logger.info('in users', { foo: 'bar' });
  res.send({ message: 'Hello world' });
});

module.exports = router;
