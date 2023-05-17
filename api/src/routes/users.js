const express = require('express');
const { query, body } = require('express-validator');
const createError = require('http-errors');

// const logger = require('../services/logger');
const userService = require('../services/user');
const { validate, addSortSantizer } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('user');
const router = express.Router();

router.get(
  '/:username',
  isPermittedTo('read'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const user = await userService.findActiveUserBy('username', req.params.username);
    if (user) { return res.json(user); }
    return next(createError.NotFound());
  }),
);

router.get(
  '/',
  validate([
    addSortSantizer(query('sort').default('username:asc')),
  ]),
  isPermittedTo('read', false),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const users = await userService.findAll(req.query.sort);
    return res.json(users);
    // res.json(req.query.sort);
  }),
);

router.post(
  '/',
  isPermittedTo('create', false),
  validate([
    body('username').isLength({ max: 100 }),
    body('email').isEmail(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const user = await userService.createUser(req.body);
    res.json(user);
  }),
);

router.patch(
  '/:username',
  isPermittedTo('update'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const updates = req.body;
    const updatedUser = await userService.updateUser(req.params.username, updates);
    res.json(updatedUser);
  }),
);

router.delete(
  '/:username',
  isPermittedTo('delete'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Users']
    const deletedUser = await userService.softDeleteUser(req.params.username);
    res.json(deletedUser);
  }),
);

module.exports = router;
