const express = require('express');

const { PrismaClient } = require('@prisma/client');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('instruments');

const prisma = new PrismaClient();

const router = express.Router();

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    const instruments = await prisma.instrument.findMany();
    res.json(instruments);
  }),
);

module.exports = router;
