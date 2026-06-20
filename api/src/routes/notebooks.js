const express = require('express');
const { body } = require('express-validator');
// const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const hubApi = require('@/services/hub_api');

const router = express.Router();

router.post(
  '/launch',
  validate([
    body('next').optional().isString().withMessage('must be a string'),
  ]),
  asyncHandler(async (req, res) => {
  // #swagger.tags = ['Notebooks']
  // #swagger.summary = 'Launch a Jupyter notebook server and get the redirect URL'

    const { username } = req.user;
    // ensure user exists in the Hub (idempotent, safe to call on every launch)
    await hubApi.ensureUser(username);
    // ensure the user's server is running (idempotent, safe to call on every launch)
    await hubApi.ensureServerRunning(username);
    // create a one-time-use login ticket for the user to be redirected with
    const { redirect_url } = hubApi.createLaunchTicket(username, req.body.next);
    res.json({ redirect_url });
  }),
);

module.exports = router;
