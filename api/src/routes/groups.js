const express = require('express');
const { param, query, body } = require('express-validator');
const createError = require('http-errors');
const _ = require('lodash/fp');
const { Prisma } = require('@prisma/client');
const assert = require('assert');
const { isUUID } = require('validator');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const groupService = require('@/services/groups');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const prisma = require('@/db');
const collectionService = require('@/services/collections');
const datasetService = require('@/services/datasets_v2');

const router = express.Router();

async function ensureNotRemovingLastAdmin(group_id, user_id) {
  // reject if this removal leads to zero admins in the group
  // This allows platform admins to remove use that leads to zero admins
  // but prevents group admins from removing the only admin (themselves) and leaving the group without any admins,
  // which would make it impossible to manage the group going forward
  const groupAdmins = await prisma.group_user.findMany({
    where: { group_id, role: 'ADMIN' },
  });
  const message = 'Cannot remove the only admin from the group.'
        + ' Please promote another member to admin before removing this member.';
  if (groupAdmins.length === 1 && groupAdmins[0].user_id === user_id) {
    assert.fail(message);
  }
}

// List user's direct groups
router.get(
  '/mine',
  validate([
    query('archived').optional().isBoolean().toBoolean(),
    // query('include_ancestors').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
  // #swagger.tags = ['Groups']
  // #swagger.summary = 'List all groups the user has access to'

    // archived=true will return only archived groups
    // archived=false will return only active groups
    // archived not provided will return all groups regardless of archived status
    const groups = await prisma.group.findMany({
      where: {
        is_archived: req.query.archived ?? Prisma.skip,
        members: {
          some: {
            user_id: req.user.id,
          },
        },
      },
      include: {
        ancestor_edges: true,
      },
    });
    res.json(groups);
  }),
);

// Search groups by name or description
router.post(
  '/search',
  validate([
    body('search_term').isString(),
    body('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    body('offset').default(0).isInt({ min: 0 }).toInt(),
    body('sort_by').default('name').isIn(['name', 'created_at', 'updated_at']),
    body('sort_order').default('asc').isIn(['asc', 'desc']),
    body('is_archived').optional().isBoolean(),
    body('direct_membership_only').optional().isBoolean(),
    body('oversight_only').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Search groups by name or description'

    const params = _.pick([
      'search_term', 'limit', 'offset', 'sort_by', 'sort_order',
      'is_archived', 'direct_membership_only', 'oversight_only',
    ])(req.body);

    // if user is platform admin, search all groups, otherwise search only groups the user has access to
    const isPlatformAdmin = req.user?.roles?.includes('admin') === true;

    // check if search term is a valid UUID, if so, search by id instead of name/description
    if (params.search_term && isUUID(params.search_term)) {
      params.group_id = params.search_term;
      delete params.search_term;
    }

    let groups;
    if (isPlatformAdmin) {
      groups = await groupService.searchAllGroups(params);
    } else {
      groups = await groupService.searchGroupsForUser({ ...params, user_id: req.user.id });
    }
    res.json(groups);
  }),
);

// Create a new group
router.post(
  '/',
  authorize('group', 'create'),
  validate([
    body('name').isString().notEmpty(),
    body('description').optional().isString().notEmpty(),
    body('allow_user_contributions').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
  // #swagger.tags = ['Groups']
  // #swagger.summary = 'Create a new group'

    const data = pickNonNil(['name', 'description', 'allow_user_contributions', 'metadata'])(req.body);
    const group = await groupService.createGroup(data, req.user.id);

    res.status(201).json(group);
  }),
);

// Create a new child group under a parent group
router.post(
  '/:id/children',
  validate([
    param('id').isUUID(),
    body('name').isString().notEmpty(),
    body('description').optional().isString().notEmpty(),
    body('allow_user_contributions').optional().isBoolean().toBoolean(),
  ]),
  authorize('group', 'create_child'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Create a new child group under a parent group'

    const { id } = req.params;
    const data = pickNonNil(['name', 'description', 'allow_user_contributions', 'metadata'])(req.body);

    const childGroup = await groupService.createChildGroup(id, data, req.user.id);

    res.status(201).json(childGroup);
  }),
);

// Get group details
router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('group', 'view_metadata'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Get group details by ID'

    const group = req.resource; // await groupService.getGroupById(id); - resource is already fetched in authorize middleware
    res.json(group);
  }),
);

//  Update group metadata
router.patch(
  '/:id',
  validate([
    param('id').isUUID(),
    query('version').isInt().toInt(), // for optimistic concurrency control
    body('name').optional().isString().notEmpty(),
    body('description').optional().isString().notEmpty(),
    body('allow_user_contributions').optional().isBoolean().toBoolean(),
  ]),
  authorize('group', 'edit_metadata'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Update group metadata'

    const { id } = req.params;

    const data = pickNonNil(['name', 'description', 'allow_user_contributions', 'metadata'])(req.body);
    if (_.isEmpty(data)) {
      return next(createError(400, 'At least one metadata field must be provided for update'));
    }

    const updatedGroup = await groupService.updateGroupMetadata(
      id,
      {
        data,
        actor_id: req.user.id,
        expected_version: req.query.version,
      },
    );
    res.json(updatedGroup);
  }),
);

// Archive a group
router.post(
  '/:id/archive',
  validate([
    param('id').isUUID(),
  ]),
  authorize('group', 'archive'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Archive a group (soft delete)'

    const { id } = req.params;

    const archivedGroup = await groupService.archiveGroup(id);
    res.json(archivedGroup);
  }),
);

// Unarchive a group
router.post(
  '/:id/unarchive',
  validate([
    param('id').isUUID(),
  ]),
  authorize('group', 'archive'), // same policy as archiving, since both actions are about changing the archived status
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Unarchive a group'

    const { id } = req.params;

    const unarchivedGroup = await groupService.unarchiveGroup(id);
    res.json(unarchivedGroup);
  }),
);

// List group members
router.get(
  '/:id/members',
  validate([
    param('id').isUUID(),
    query('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  authorize('group', 'view_members'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'List members of a group'

    const { id } = req.params;
    const { limit, offset } = req.query;

    const members = await groupService.listGroupMembers(id, { limit, offset });
    res.json(members);
  }),
);

// Add member to group
router.put(
  '/:id/members/:userId',
  validate([
    param('id').isUUID(),
    param('userId').isInt().toInt(),
  ]),
  authorize('group', 'add_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Add a member to the group'

    const { id, userId } = req.params;

    await groupService.addGroupMembers(id, { user_ids: [userId], actor_id: req.user.id });
    res.status(204).send();
  }),
);

// Remove member from group
router.delete(
  '/:id/members/:userId',
  validate([
    param('id').isUUID(),
    param('userId').isInt().toInt(),
  ]),
  authorize('group', 'remove_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Remove a member from the group'

    const { id, userId } = req.params;

    await ensureNotRemovingLastAdmin(id, userId);

    const deletedUserIds = await groupService.removeGroupMembers(
      id,
      { user_ids: [userId], actor_id: req.user.id },
    );
    if (deletedUserIds.length === 0) {
      throw createError.NotFound('User is not a member of the group');
    }
    res.status(204).send();
  }),
);

// bulk add members to group
router.post(
  '/:id/members',
  validate([
    param('id').isUUID(),
    body('members').isArray({ min: 1 }),
    body('members.*.user_id').isInt().toInt(),
  ]),
  authorize('group', 'add_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Bulk add members to the group'

    const { id } = req.params;
    const { members } = req.body; // array of { user_id, role }

    await groupService.addGroupMembers(id, {
      actor_id: req.user.id,
      user_ids: members.map((m) => m.user_id),
    });
    res.status(204).send();
  }),
);

// Promote member to admin
router.put(
  '/:id/admins/:userId',
  validate([
    param('id').isUUID(),
    param('userId').isInt().toInt(),
  ]),
  authorize('group', 'edit_member_role'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Promote a member to admin of the group'

    const { id, userId } = req.params;

    await groupService.promoteGroupMemberToAdmin(id, { user_id: userId, actor_id: req.user.id });
    res.status(204).send();
  }),
);

// Remove admin from group
router.delete(
  '/:id/admins/:userId',
  validate([
    param('id').isUUID(),
    param('userId').isInt().toInt(),
  ]),
  authorize('group', 'edit_member_role'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Remove an admin from the group'

    const { id, userId } = req.params;

    await ensureNotRemovingLastAdmin(id, userId);

    await groupService.removeGroupAdmin(id, { user_id: userId, actor_id: req.user.id });
    res.status(204).send();
  }),
);

// bulk remove members from group
router.delete(
  '/:id/members',
  validate([
    param('id').isUUID(),
    body('user_ids').isArray({ min: 1 }),
    body('user_ids.*').isInt().toInt(),
  ]),
  authorize('group', 'remove_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Bulk remove members from the group'

    const { id } = req.params;
    const { user_ids } = req.body;

    // check if any of the removals would lead to zero admins in the group
    await Promise.all(user_ids.map((user_id) => ensureNotRemovingLastAdmin(id, user_id)));

    await groupService.removeGroupMembers(id, { user_ids, actor_id: req.user.id });
    res.status(204).send();
  }),
);

// Get ancestor groups (hierarchy upward)
router.get(
  '/:id/ancestors',
  validate([
    param('id').isUUID(),
  ]),
  authorize('group', 'view_ancestors'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Get ancestor groups (hierarchy upward)'

    const { id } = req.params;
    const ancestors = await groupService.getGroupAncestors(id);
    res.json(ancestors);
  }),
);

// TODO
// Get descendant groups (hierarchy downward)
router.get(
  '/:id/descendants',
  validate([
    param('id').isUUID(),
  ]),
  authorize('group', 'view_children'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Get descendant groups (hierarchy downward)'

    const { id } = req.params;
    const descendants = await groupService.getGroupDescendants(id);
    res.json(descendants);
  }),
);

// POST /api/groups/:id/reparent
// Move group to new parent
// router.post('/:id/reparent', asyncHandler(async (req, res) => {})) - Don't implement until we have a use case for it,
// as it's complex and not currently needed

// List datasets owned by group
// router.get(
//   '/:id/datasets',
//   validate([
//     param('id').isUUID(),
//     query('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
//     query('offset').default(0).isInt({ min: 0 }).toInt(),
//   ]),
//   asyncHandler(async (req, res) => {
//     // #swagger.tags = ['Groups']
//     // #swagger.summary = 'List datasets owned by the group'

//     const { id } = req.params;
//     const { limit, offset } = req.query;
//   }),
// );

// List collections owned by group
router.get(
  '/:id/collections',
  validate([
    param('id').isUUID(),
    query('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('sort_by').default('name').isIn(['name', 'created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
  ]),
  authorize('group', 'view_resources'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'List collections owned by the group'

    const { id } = req.params;
    const {
      limit, offset, sort_by, sort_order,
    } = req.query;
    const collections = await collectionService.findCollectionsByOwnerGroup({
      group_id: id, limit, offset, sort_by, sort_order,
    });
    res.json(collections);
  }),
);

// List datasets owned by group
router.get(
  '/:id/datasets',
  validate([
    param('id').isUUID(),
    query('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('sort_by').default('name').isIn(['name', 'created_at', 'updated_at']),
    query('sort_order').default('asc').isIn(['asc', 'desc']),
  ]),
  authorize('group', 'view_resources'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'List datasets owned by the group'

    const { id } = req.params;
    const {
      limit, offset, sort_by, sort_order,
    } = req.query;
    const datasets = await datasetService.findDatasetsByOwnerGroup({
      group_id: id, limit, offset, sort_by, sort_order,
    });
    res.json(datasets);
  }),
);

module.exports = router;
