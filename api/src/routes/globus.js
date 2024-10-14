const express = require('express');
const { query, body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');
const { validate } = require('../middleware/validators');
const globusService = require('../services/globus');

const isPermittedTo = accessControl('datasets');

const router = express.Router();

router.post(
  '/token',
  validate([
    body('code').escape().notEmpty(),
  ]),
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    globusService.getToken({ code: req.body.code }).then((response) => {
      console.log('Globus token received:', response.data);
      res.json(response.data);
    });
  }),
);

module.exports = router;
