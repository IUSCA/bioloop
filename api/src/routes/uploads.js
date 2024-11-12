const express = require('express');
const { body } = require('express-validator');

const asyncHandler = require('../middleware/asyncHandler');
const { validate } = require('../middleware/validators');
const { accessControl } = require('../middleware/auth');

const authService = require('../services/auth');

const isPermittedTo = accessControl('upload');

const router = express.Router();

router.post(
  '/token',
  isPermittedTo('create'),
  validate([
    body('file_name').notEmpty().escape(),
  ]),
  asyncHandler(async (req, res) => {
    let token;
    try {
      token = await authService.get_upload_token(req.body.file_name);
    } catch (e) {
      console.error(e);
    }
    res.json(token);
  }),
);

module.exports = router;
