const express = require('express');
const { body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');
const authService = require('../services/auth');

const isPermittedTo = accessControl('datasets');

const router = express.Router();

router.post(
  '/token',
  isPermittedTo('create'),
  validate([
    body('file_name').notEmpty().escape(),
  ]),
  asyncHandler(async (req, res) => {
    const token = await authService.get_upload_token(req.body.file_name);
    res.json(token);
  }),
);

module.exports = router;
