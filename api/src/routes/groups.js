const express = require('express');
const { setDifference } = require('@/utils');
const { query, body } = require('express-validator');
const _ = require('lodash/fp');

const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');
const groupService = require('@/services/group');
const prisma = require('@/db');

const isPermittedTo = accessControl('groups');
const router = express.Router();

/**
 * Get all groups
 */
router.get(
  '/all',
  isPermittedTo('read'),
  validate([
    query('take').default(25).isInt().toInt(),
    query('skip').default(0).isInt({ min: 0 }).toInt(),
    query('search').default(''),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('sort_by').default('updated_at').isIn(['name', 'created_at', 'updated_at']),
    query('include_users').default(false).toBoolean(),
    query('include_projects').default(false).toBoolean(),
    query('include_children').default(false).toBoolean(),
    query('include_parent').default(false).toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Get all groups
    const {
      search, sort_order, sort_by, include_users, include_projects, include_children, include_parent,
    } = req.query;

    const filters = search
      ? {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      }
      : {};

    const sort_obj = {
      [sort_by]: sort_order,
    };

    const [groups, totalCount] = await prisma.$transaction([
      prisma.group.findMany({
        skip: req.query.skip,
        take: req.query.take,
        orderBy: sort_obj,
        where: filters,
        include: groupService.build_include_object({
          include_users,
          include_projects,
          include_children,
          include_parent,
        }),
      }),
      prisma.group.count({
        where: filters,
      }),
    ]);

    res.json({
      metadata: { count: totalCount },
      groups,
    });
  }),
);

/**
 * Get groups accessible by a specific user
 */
router.get(
  '/:username/all',
  isPermittedTo('read', { checkOwnership: true }),
  validate([
    query('take').default(25).isInt({ min: 1 }).toInt(),
    query('skip').default(0).isInt({ min: 0 }).toInt(),
    query('search').default(''),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('sort_by').default('updated_at').isIn(['name', 'created_at', 'updated_at']),
    query('include_users').default(false).toBoolean(),
    query('include_projects').default(false).toBoolean(),
    query('include_children').default(false).toBoolean(),
    query('include_parent').default(false).toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Get all groups a user is a member of
    const {
      search, sort_order, sort_by, include_users, include_projects, include_children, include_parent,
    } = req.query;
    const { username } = req.params;

    const filters = search
      ? {
        AND: [
          {
            users: {
              some: {
                user: {
                  username,
                },
              },
            },
          },
          {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      }
      : {
        users: {
          some: {
            user: {
              username,
            },
          },
        },
      };

    const sort_obj = {
      [sort_by]: sort_order,
    };

    const [groups, totalCount] = await prisma.$transaction([
      prisma.group.findMany({
        where: filters,
        skip: req.query.skip,
        take: req.query.take,
        orderBy: sort_obj,
        include: groupService.build_include_object({
          include_users,
          include_projects,
          include_children,
          include_parent,
        }),
      }),
      prisma.group.count({
        where: filters,
      }),
    ]);

    res.json({
      metadata: { count: totalCount },
      groups: groups.map((g) => req.permission.filter(g)),
    });
  }),
);

/**
 * Get a specific group by ID
 */
router.get(
  '/:id',
  isPermittedTo('read'),
  validate([
    query('include_users').default(true).toBoolean(),
    query('include_projects').default(true).toBoolean(),
    query('include_children').default(true).toBoolean(),
    query('include_parent').default(true).toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Get a specific group
    const {
      include_users, include_projects, include_children, include_parent,
    } = req.query;

    const group = await prisma.group.findUniqueOrThrow({
      where: {
        id: parseInt(req.params.id, 10),
      },
      include: groupService.build_include_object({
        include_users,
        include_projects,
        include_children,
        include_parent,
      }),
    });

    res.json(group);
  }),
);

/**
 * Create a new group
 */
router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('name').notEmpty().isString(),
    body('description').optional().isString(),
    body('parent_id').optional().isInt().toInt(),
    body('owner_id').optional().isInt().toInt(),
    body('metadata').optional().isObject(),
    body('user_ids').optional().isArray().withMessage('user_ids must be an array')
      .custom((value) => value.every((id) => typeof id === 'number' && Number.isInteger(id)))
      .withMessage('user_ids must be an array of integers'),
    body('project_ids').optional().isArray().withMessage('project_ids must be an array')
      .custom((value) => value.every((id) => typeof id === 'string'))
      .withMessage('project_ids must be an array of strings'),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Create a new group

    const group = await groupService.create_group({
      data: {
        ...req.body,
        assignor_id: req.user.id,
      },
      include: {
        include_users: true,
        include_projects: true,
        include_children: true,
        include_parent: true,
      },
    });

    res.json(group);
  }),
);

/**
 * Update group users
 */
router.patch(
  '/:id/users',
  isPermittedTo('update'),
  validate([
    body('user_ids').exists().isArray(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Associate users to a group

    const _id = parseInt(req.params.id, 10);

    // Get group or send 404 if not found
    const group = await prisma.group.findUniqueOrThrow({
      where: {
        id: _id,
      },
      include: groupService.build_include_object({ include_users: true }),
    });

    const cur_user_ids = group.users.map((obj) => obj.user.id);
    const req_user_ids = req.body.user_ids || [];

    const user_ids_to_add = [...setDifference(new Set(req_user_ids), new Set(cur_user_ids))];
    const user_ids_to_remove = [...setDifference(new Set(cur_user_ids), new Set(req_user_ids))];

    // Delete associations
    const delete_assocs = prisma.group_user.deleteMany({
      where: {
        group_id: _id,
        user_id: {
          in: user_ids_to_remove,
        },
      },
    });

    const data = user_ids_to_add.map((user_id) => ({
      group_id: _id,
      user_id,
      assignor_id: req.user.id,
    }));
    const add_assocs = prisma.group_user.createMany({
      data,
    });

    await prisma.$transaction([
      delete_assocs,
      add_assocs,
    ]);

    res.send();
  }),
);

/**
 * Update group projects
 */
router.patch(
  '/:id/projects',
  isPermittedTo('update'),
  validate([
    body('add_project_ids').isArray().optional(),
    body('remove_project_ids').isArray().optional(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Associate projects to a group

    const _id = parseInt(req.params.id, 10);

    // Get group or send 404 if not found
    await prisma.group.findUniqueOrThrow({
      where: {
        id: _id,
      },
    });

    const add_project_ids = req.body.add_project_ids || [];
    const remove_project_ids = req.body.remove_project_ids || [];

    const create_data = add_project_ids.map((project_id) => ({
      group_id: _id,
      project_id,
      assignor_id: req.user.id,
    }));
    const delete_data = remove_project_ids.map((project_id) => ({
      group_id: _id,
      project_id,
    }));

    // Create new associations
    const add_assocs = prisma.group_project.createMany({
      data: create_data,
    });
    // Delete existing associations
    const delete_assocs = prisma.group_project.deleteMany({
      where: {
        OR: delete_data,
      },
    });

    await prisma.$transaction([delete_assocs, add_assocs]);

    res.send();
  }),
);

/**
 * Update group metadata
 */
router.patch(
  '/:id',
  isPermittedTo('update'),
  validate([
    body('name').optional().isString(),
    body('description').optional().isString(),
    body('parent_id').optional().isInt().toInt(),
    body('metadata').optional().isObject(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Update a group

    const _id = parseInt(req.params.id, 10);

    const data = _.flow([
      _.pick(['name', 'description', 'parent_id', 'metadata']),
      _.omitBy(_.isNil),
    ])(req.body);

    // Get group or send 404 if not found
    const groupToUpdate = await prisma.group.findUniqueOrThrow({
      where: {
        id: _id,
      },
      include: groupService.build_include_object(),
    });

    data.metadata = _.merge(groupToUpdate?.metadata)(data.metadata); // deep merge

    const updatedGroup = await prisma.group.update({
      where: {
        id: _id,
      },
      data,
      include: groupService.build_include_object({
        include_users: true,
        include_projects: true,
        include_children: true,
        include_parent: true,
      }),
    });

    res.json(updatedGroup);
  }),
);

/**
 * Delete a group
 */
router.delete(
  '/:id',
  isPermittedTo('delete'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = Delete a group and all its associations

    const _id = parseInt(req.params.id, 10);

    const deleted_group = await prisma.group.delete({
      where: {
        id: _id,
      },
    });

    res.json(deleted_group);
  }),
);

module.exports = router;
