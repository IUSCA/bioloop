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

const isPermittedTo = accessControl('about');

const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);
// const sanitizeHTML = (html) => ;

router.get(
  '/latest',
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

router.post(
  '/',
  authenticate,
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    const ret = await prisma.about.create({
      data: {
        html: DOMPurify.sanitize(req.body.html),
        last_updated_by_id: req.user.id,
      },
    });
    res.json(ret);
  }),
);

router.put(
  '/:id',
  authenticate,
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    const ret = await prisma.about.update({
      where: {
        id: req.params.id,
      },
      data: {
        html: DOMPurify.sanitize(req.body.html),
        last_updated_by_id: req.user.id,
      },
    });
    res.json(ret);
  }),
);

module.exports = router;
