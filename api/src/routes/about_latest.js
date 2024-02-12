const express = require('express');
const { PrismaClient } = require('@prisma/client');

const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
const prisma = new PrismaClient();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const ret = await prisma.about.findMany({
      orderBy: {
        created_at: 'desc',
      },
      take: 1,
    });

    res.json(ret[0]);
  }),
);

module.exports = router;
