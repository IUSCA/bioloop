const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { query } = require('express-validator');
const _ = require('lodash/fp');

const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');

const isPermittedTo = accessControl('bundles');

const router = express.Router();
const prisma = new PrismaClient();

// worker
router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('name').notEmpty().escape().optional(),
    query('checksum').notEmpty().escape().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    const { name, checksum } = req.query;

    const filterBy = _.omitBy(_.isUndefined)({ name, md5: checksum });
    const bundles = await prisma.bundle.findMany({
      where: filterBy,
    });
    res.json(bundles);
  }),
);

// worker
router.post(
  '/',
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
    const bundle = await prisma.bundle.create({
      data: req.body,
    });
    res.json(bundle);
  }),
);

module.exports = router;
