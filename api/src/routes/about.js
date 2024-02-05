const express = require('express');
const { PrismaClient } = require('@prisma/client');

const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');

const router = express.Router();
const prisma = new PrismaClient();
const {
  query, param, body, checkSchema,
} = require('express-validator');

const isPermittedTo = accessControl('about');

router.get('/', isPermittedTo('read'), asyncHandler(async (req, res, next) => {
  const ret = await prisma.about.findMany();
  res.json(ret);
}));

router.post('/', isPermittedTo('update'), validate([
  body('text').notEmpty().isString(),
]), asyncHandler(async (req, res, next) => {
  const ret = await prisma.about.create({
    data: {
      text: req.body.text,
      created_by_id: req.user.id,
    },
  });
  res.json(ret);
}));

// router.get('/:version', isPermittedTo('read'), asyncHandler(async (req, res, next) => {
//   await prisma.$executeRaw(`
//   `)
// }))

module.exports = router;
