const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { param } = require('express-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const { authenticate } = require('../middleware/auth');
const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');

const router = express.Router();
const prisma = new PrismaClient();

const isPermittedTo = accessControl('settings');

router.get(
  '/',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    const ret = await prisma.feature_flag.findMany();
    res.json(ret);
  }),
);

module.exports = router;
