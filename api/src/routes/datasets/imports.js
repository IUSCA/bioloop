const express = require('express');
const prisma = require('@/db');
const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');

const isPermittedTo = accessControl('import_sources');
const router = express.Router();

// TODO: Future enhancement - filter import sources by user role or ownership
router.get(
  '/sources',
  isPermittedTo('read'),
  asyncHandler(async (req, res) => {
    const sources = await prisma.import_source.findMany({
      orderBy: [
        { sort_order: { sort: 'asc', nulls: 'last' } },
        { label: 'asc' },
      ],
    });
    res.json(sources);
  }),
);

module.exports = router;
