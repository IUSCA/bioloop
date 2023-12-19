const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const authService = require('../services/auth');

const isPermittedTo = accessControl('uploads');

const router = express.Router();

router.get(
  '/token',
  isPermittedTo('create'),
  asyncHandler(async (req, res) => {
    res.json(authService.get_upload_token());
  }),
);

module.exports = router;
