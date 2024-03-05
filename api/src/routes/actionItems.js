const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { param, body } = require('express-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const { authenticate } = require('../middleware/auth');
const { accessControl } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');

const router = express.Router();
const prisma = new PrismaClient();

const isPermittedTo = accessControl('action_items');

router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('type').escape().notEmpty(),
    body('label').optional().escape().notEmpty(),
    body('dataset_id').optional().isInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const actionItem = await prisma.action_item.create({
      data: {
        type: req.body.type,
        label: req.body.label,
        dataset_id: req.body.dataset_id,
      },
    });
    res.json(actionItem);
  }),
);

module.exports = router;
