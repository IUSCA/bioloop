const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { body, param } = require('express-validator');

const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');

const router = express.Router();
const prisma = new PrismaClient();

const isPermittedTo = accessControl('about');

router.post(
  '/',
  isPermittedTo('update'),
  validate([
    body('text').escape().notEmpty().isString(),
  ]),
  asyncHandler(async (req, res, next) => {
    const ret = await prisma.about.create({
      data: {
        text: req.body.text,
        created_by_id: req.user.id,
      },
    });
    res.json(ret);
  }),
);

router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('text').escape().notEmpty().isString(),
  ]),
  asyncHandler(async (req, res, next) => {
    const ret = await prisma.about.update({
      where: {
        id: req.params.id,
      },
      data: {
        text: req.body.text,
        created_by_id: req.user.id,
      },
    });
    res.json(ret);
  }),
);

module.exports = router;
