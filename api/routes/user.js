const express = require('express');
const { query, param } = require('express-validator');
// const { PrismaClient } = require('@prisma/client');
// const _ = require('lodash');

const logger = require('../services/logger');
const userService = require('../services/user');
const validator = require('../middleware/validator');

const router = express.Router();
// const prisma = new PrismaClient();

router.get('/', (req, res, next) => {
  logger.info('in users', { foo: 'bar' });
  res.send({ message: 'Hello world' });
});

router.get(
  '/:id',
  param('id').toInt(),
  query('sortby').default('asc').isIn(['asc', 'desc']),
  validator(async (req, res, next) => {
    logger.info(`in users - ${req.params.id}, ${req.query.sortby}`);
    const user = await userService.findUserById(req.params.id);
    res.json(user);
  }),
);

module.exports = router;
