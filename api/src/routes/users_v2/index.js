const express = require('express');
const createError = require('http-errors');
const { query } = require('express-validator');

// const logger = require('@/services/logger');
const userService = require('@/services/user');
const { validate } = require('@/middleware/validators');
const asyncHandler = require('@/middleware/asyncHandler');
const { createAuthorizationMiddleware: authorize, callerIsPlatformAdmin } = require('@/authorization');
const groupService = require('@/services/groups');
const directory = require('@/services/user_directory');

const router = express.Router();

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Users']
    // #swagger.summary = 'The signed-in user, and three facts pages use to choose what to offer'

    // Read from `user_role` and the membership views, as the engine reads them. The pages use
    // these to choose sections and offers; every action is still decided by its own route.
    // @see docs/design/groups/access-model.md — The UI consumption contract
    const [is_platform_admin, counts] = await Promise.all([
      callerIsPlatformAdmin(req),
      groupService.governanceCounts(req.user.subject_id),
    ]);
    return res.json({ user: req.user, is_platform_admin, ...counts });
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

    // Only a platform admin reads the whole directory, with roles and last login. Everyone
    // else searches it and gets names and addresses for a few matches.
    // @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 15
    if (!(await callerIsPlatformAdmin(req))) {
      const term = search.trim();
      if (term.length < directory.SEARCH_LENGTH_BEFORE_DISCLOSURE) {
        return next(createError.BadRequest(
          `search must be at least ${directory.SEARCH_LENGTH_BEFORE_DISCLOSURE} characters`,
        ));
      }
      const users = await directory.searchDirectory({ search: term, take });
      return res.json({ metadata: { count: users.length }, users });
    }

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
