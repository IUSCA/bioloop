const express = require('express');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper');
const config = require('config');

const validator = require('../middleware/validator');
const userService = require('../services/user.service');
const authService = require('../services/auth.service');

const router = express.Router();

const IULogin = new IULoginHelper({
  protocol: 'CAS',
  mode: config.get('auth.mode'),
});

router.get(
  '/casurl',
  query('service').notEmpty(),
  validator(async (req, res, next) => {
    const loginUrl = IULogin.get_login_url(req.query.service);
    res.json({ url: loginUrl });
  }),
);

router.post(
  '/verify',
  body('ticket').notEmpty(),
  body('service').notEmpty(),
  validator(async (req, res, next) => {
    // eslint-disable-next-line no-unused-vars
    IULogin.validate(req.body.ticket, req.body.service, false, async (err, username, profile) => {
      if (err) return next(err);
      const user = await userService.findUserById(username);
      if (user) {
        const resObj = await authService.onLogin(user);
        return res.json(resObj);
      }
      // User was authenticated with CAS but they are not a portal user
      // Send an empty success message
      return res.status(204).send();
    });
  }),
);

module.exports = router;
