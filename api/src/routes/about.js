const express = require('express');
const { PrismaClient } = require('@prisma/client');

const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const isPermittedTo = accessControl('about');
const router = express.Router();
const prisma = new PrismaClient();

router.get('/', isPermittedTo('read'), asyncHandler(async (req, res, next) => {
  const ret = await prisma.about.findMany();
  res.json(ret);
}));

// router.get('/:version', isPermittedTo('read'), asyncHandler(async (req, res, next) => {
//   await prisma.$executeRaw(`
//   `)
// }))

module.exports = router;
