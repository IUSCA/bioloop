const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body } = require('express-validator');

const he = require('he');
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
    body('dataset_id').isInt().toInt(),
    body('source_collection_id').escape().notEmpty(),
    body('source_file_path').escape().notEmpty(),
    body('destination_collection_id').escape().notEmpty(),
    body('destination_file_path').escape().notEmpty(),
    body('user_id').isInt().toInt(),
    body('status').optional().escape().notEmpty(),
  ]),
  isPermittedTo('create'),
  asyncHandler(async (req, res, next) => {
    // console.log('req.body', req.body);

    const datasetShareCreateQuery = req.body.dataset_id ? {
      dataset_share: {
        create: {
          source_file_path: decodeURI(he.decode(req.body.source_file_path)),
          destination_file_path: decodeURI(he.decode(req.body.destination_file_path)),
          status: req.body.status,
          user: { connect: { id: req.body.user_id } },
          dataset: { connect: { id: req.body.dataset_id } },
        },
      },
    } : {};

    const logGlobusShare = await prisma.globus_share.create({
      data: {
        source_collection_id: req.body.source_collection_id,
        destination_collection_id: req.body.destination_collection_id,
        status: req.body.status,
        ...datasetShareCreateQuery,
      },
    });

    res.json(logGlobusShare);
  }),
);

module.exports = router;
