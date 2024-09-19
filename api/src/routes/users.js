const express = require('express');
const { query, body } = require('express-validator');
const createError = require('http-errors');
const { PrismaClient } = require('@prisma/client');

// const logger = require('../services/logger');
const userService = require('../services/user');
const { validate } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const prisma = new PrismaClient();
const isPermittedTo = accessControl('user');
const router = express.Router();

router.get(
  '/:username',
  isPermittedTo('read', { checkOwnerShip: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const user = await userService.findActiveUserBy('username', req.params.username);
    if (user) { return res.json(user); }
    return next(createError.NotFound());
  }),
);

router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('search').default(''),
    query('skip').isInt({ min: 0 }).optional(),
    query('take').isInt({ min: 1 }).optional(),
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
      skip: parseInt(skip, 10),
      take: parseInt(take, 10),
    });
    return res.json({
      metadata: { count },
      users,
    });
  }),
);

router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('username').isLength({ max: 100 }),
    body('email').isEmail(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']

    // operators can create a new user but cannot specify a role
    // if the roles is unset, set the roles as ['user']
    // clears the roles attribute when requester has no admin role
    const user_data = req.permission.filter(req.body);
    user_data.roles = user_data.roles || ['user'];

    const user = await userService.createUser(user_data);
    res.json(user);
  }),
);

router.patch(
  '/:username',
  isPermittedTo('update', { checkOwnerShip: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']

    // isPermittedTo('update') - stops requesters with just a user role from running this code
    // clears the roles attribute when requester has no admin role
    const updates = req.permission.filter(req.body);

    // operators can edit themselves - all attributes except roles
    // operators can edit users with 'user' role - all attributes except roles
    // if the roles is unset, existing roles are preserved
    let can_update = false;
    if (req.user.roles.includes('admin')) {
      can_update = true;
    } else {
      const resource = userService.transformUser(
        await prisma.user.findUniqueOrThrow(
          {
            where: { username: req.params.username },
            include: userService.INCLUDE_ROLES_LOGIN,
          },
        ),
      );

      if (
        req.user.username === req.params.username
        || resource.roles.includes('user')
        || resource.roles.length === 0
      ) {
        can_update = true;
        updates.roles = resource.roles || ['user'];
      }
    }

    if (!can_update) {
      return next(createError.Forbidden('Insufficient privilages to update user'));
    }

    const updatedUser = await userService.updateUser(req.params.username, updates);
    res.json(updatedUser);
  }),
);

router.delete(
  '/:username',
  isPermittedTo('delete', { checkOwnerShip: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const deletedUser = await userService.softDeleteUser(req.params.username);
    res.json(deletedUser);
  }),
);

module.exports = router;
