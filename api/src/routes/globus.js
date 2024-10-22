const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body } = require('express-validator');

const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const globusService = require('../services/globus');

const isPermittedTo = accessControl('datasets');
const prisma = new PrismaClient();
const router = express.Router();

router.post(
  '/token',
  validate([
    body('code').escape().notEmpty(),
  ]),
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
    globusService.getToken({ code: req.body.code }).then((response) => {
      console.log('Globus token received:', response.data);
      res.json(response.data);
    });
  }),
);

router.post(
  '/log',
  validate([
    body('dataset_id').escape().notEmpty(),
    body('source_collection_id').escape().notEmpty(),
    body('destination_collection_id').escape().notEmpty(),
    body('user_id').escape().notEmpty(),
  ]),
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
    const log = await prisma.dataset_share.create({
      data: {
        dataset: { connect: { id: req.body.dataset_id } },
        source_collection_id: req.body.source_collection_id,
        destination_collection_id: req.body.destination_collection_id,
        user_id: req.body.user_id,
      },
    });
    res.json(log);
  }),
);

module.exports = router;
