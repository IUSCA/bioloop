const express = require('express');
const { query, body } = require('express-validator');
const IULoginHelper = require('@iusca/iulogin-helper'); // cspell: disable-line
const config = require('config');

const createError = require('http-errors');
const { validate } = require('@/middleware/validators');
const asyncHandler = require('@/middleware/asyncHandler');
const { loginHandler } = require('@/middleware/auth');
const logger = require('@/services/logger');
const authService = require('@/services/auth');

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
    body('service').optional().notEmpty(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Auth']
    // eslint-disable-next-line no-unused-vars
    const login = async (cas_id) => {
      if (!cas_id) {
        logger.error('CAS login failed: no cas_id');
        return next(createError.InternalServerError());
      }
      const user = await authService.getLoginUser('cas_id', cas_id);

      req.auth = {
        user,
        method: 'IUCAS',
        identity: {
          email: `${cas_id}@iu.edu`,
          cas_id,
        },
      };
      next();
    };

    if (config.mode === 'ci') {
      const test_user = await authService.find_or_create_test_user({ identifier: req.body.ticket });
      await login(test_user.cas_id);
    } else {
      if (!req.body.service) {
        return next(createError.BadRequest('Service is required'));
      }
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
