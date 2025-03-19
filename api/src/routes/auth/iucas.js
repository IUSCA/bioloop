const express = require('express');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper');
const config = require('config');

const { validate } = require('../../middleware/validators');
const asyncHandler = require('../../middleware/asyncHandler');
const { loginHandler } = require('../../middleware/auth');

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
    const login = async (cas_id) => {
      const user = await authService.getLoginUser('cas_id', cas_id);

      req.auth_user = user;
      req.auth_method = 'IUCAS';
      next();
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
  loginHandler,
);

module.exports = router;
