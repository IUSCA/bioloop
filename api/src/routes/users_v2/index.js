const express = require('express');
const { query } = require('express-validator');

// const logger = require('@/services/logger');
const userService = require('@/services/user');
const { validate } = require('@/middleware/validators');
const asyncHandler = require('@/middleware/asyncHandler');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const auth = require('@/services/auth');
const groupService = require('@/services/groups');

const router = express.Router();

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Users']
    // returns the authenticated user's dashboard role information

    const isPlatformAdmin = auth.isPlatformAdmin(req);

    let isGroupAdmin = false;
    if (!isPlatformAdmin) {
      isGroupAdmin = await groupService.isGroupAdmin(req.user.subject_id);
    }

    // NOTE: these values are used for UI routing/dashboard selection only.
    // They are not used for access control.
    let uiPersona = 'standard_user';
    if (isPlatformAdmin) {
      uiPersona = 'platform_admin';
    } else if (isGroupAdmin) {
      uiPersona = 'group_admin';
    }

    return res.json({
      user: req.user,
      uiPersona,
    });
  }),
);

router.get(
  '/',
  authorize('user', 'list'),
  validate([
    query('search').default(''),
    query('skip').isInt({ min: 0 }).toInt().optional(),
    query('take').isInt({ min: 1 }).toInt().optional(),
    query('sortBy').default('username')
      .isIn(['name', 'username', 'email', 'created_at', 'last_login', 'login_method', 'is_deleted']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const {
      search, sortBy, sort_order, skip, take,
    } = req.query;

    const { users, count } = await userService.findAll({
      search,
      sortBy,
      sort_order,
      skip,
      take,
    });
    return res.json({
      metadata: { count },
      users,
    });
  }),
);

module.exports = router;
