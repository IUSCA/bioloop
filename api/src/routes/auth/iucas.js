const express = require('express');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper');
const config = require('config');

const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');

const userService = require('../../services/user');
const authService = require('../../services/auth');

const router = express.Router();

const IULogin = new IULoginHelper({
  protocol: 'CAS',
  mode: config.get('auth.mode'),
});

router.get(
  '/url',
  validate([
    query('service').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
    const loginUrl = IULogin.get_login_url(req.query.service);
    res.json({ url: loginUrl });
  }),
);

router.post(
  '/verify',
  validate([
    body('ticket').notEmpty(),
    body('service').notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
    // eslint-disable-next-line no-unused-vars

    console.log('req.body.ticket', req.body.ticket);
    const login = async (cas_id) => {
      console.log('getting user...')
      const user = await userService.findActiveUserBy('cas_id', cas_id);

      console.log('user', user);
      if (user) {
        const resObj = await authService.onLogin({ user });
        
        console.log('resObj', resObj);
        return res.json(resObj);
      }
      // User was authenticated with CAS but they are not a portal user
      // Send an empty success message
      return res.status(204).send();
    };

    if (config.mode === 'ci') {
      const test_user = await authService.find_or_create_test_user({ role: req.body.ticket });
      await login(test_user.cas_id);
    } else {
      IULogin.validate(req.body.ticket, req.body.service, false, async (err, cas_id) => {
        if (err) return next(err);
        try {
          await login(cas_id);
        } catch (err2) {
          return next(err2);
        }
      });
    }
  }),
);

module.exports = router;
