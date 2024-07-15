const express = require('express');

const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(process.env.NODE_ENV);
  }),
);

module.exports = router;
