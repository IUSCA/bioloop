const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const authService = require('../services/auth');

const isPermittedTo = accessControl('datasets');

const router = express.Router();

router.get(
  '/token/:file_name',
  isPermittedTo('create'),
  asyncHandler(async (req, res) => {
    const token = await authService.get_upload_token(req.params.file_name);
    res.json(token);
  }),
);

module.exports = router;
