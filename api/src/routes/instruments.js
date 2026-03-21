const express = require('express');

const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const prisma = require('@/db');

const isPermittedTo = accessControl('instruments');
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
