const express = require('express');
const { param, query, body } = require('express-validator');
const createError = require('http-errors');
const _ = require('lodash/fp');
const assert = require('assert');
const { isUUID } = require('validator');
const { GROUP_MEMBER_ROLE } = require('@prisma/client');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const groupService = require('@/services/groups');
const { createAuthorizationMiddleware: authorize, authorizeAction } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const prisma = require('@/db');
const collectionService = require('@/services/collections');
const datasetService = require('@/services/datasets_v2');

const router = express.Router();

/**
 * Helper function to ensure that a user is not removing the last admin from a group
 *
 * @param {string} group_id - UUID of group
 * @param {string} user_id - UUID of user
 */
async function ensureNotRemovingLastAdmin(group_id, user_id) {
  // reject if this removal leads to zero admins in the group
  // This allows platform admins to remove use that leads to zero admins
  // but prevents group admins from removing the only admin (themselves) and leaving the group without any admins,
  // which would make it impossible to manage the group going forward
  const groupAdmins = await prisma.group_user.findMany({
    where: { group_id, role: GROUP_MEMBER_ROLE.ADMIN },
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
  authorize('group', 'list', { shouldDeriveCallerRole: true }),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'List all groups the user has access to'

    const { metadata, data } = await groupService.getMyGroups({
      user_id: req.user.subject_id,
      archived: req.query.archived,
      // include_ancestors: req.query.include_ancestors,
    });
    const filteredGroups = data.map((g) => req.permission.filter(g));
    res.json({ metadata, data: filteredGroups, _meta: { caller_role: req.permission.callerRole } });
  }),
);

// Search groups by name or description
router.post(
  '/search',
  validate([
    body('search_term').isString().optional(),
    body('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    body('offset').default(0).isInt({ min: 0 }).toInt(),
    body('sort_by').default('name').isIn(['name', 'created_at', 'updated_at']),
    body('sort_order').default('asc').isIn(['asc', 'desc']),
    body('is_archived').optional().isBoolean(),
    body('direct_membership_only').optional().isBoolean(),
    body('oversight_only').optional().isBoolean(),
    body('admin_only').optional().isBoolean(),
  ]),
  authorize('group', 'list'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Search groups by name or description'

    const params = _.pick([
      'search_term', 'limit', 'offset', 'sort_by', 'sort_order',
      'is_archived', 'direct_membership_only', 'oversight_only', 'admin_only',
    ])(req.body);

    // if user is platform admin, search all groups, otherwise search only groups the user has access to
    const isPlatformAdmin = req.user?.roles?.includes('admin') === true;

    // check if search term is a valid UUID, if so, search by id instead of name/description
    if (params.search_term && isUUID(params.search_term)) {
      params.group_id = params.search_term;
      delete params.search_term;
    }

    let promise;
    if (isPlatformAdmin) {
      promise = groupService.searchAllGroups({ ...params, user_id: req.user.subject_id });
    } else {
      promise = groupService.searchGroupsForUser({ ...params, user_id: req.user.subject_id });
    }
    const { metadata, data } = await promise;
    const filteredGroups = data.map((g) => req.permission.filter(g));
    res.json({ metadata, data: filteredGroups });
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
    const group = await groupService.createGroup(data, req.user.subject_id);

    res.status(201).json(req.permission.filter(group));
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

    const childGroup = await groupService.createChildGroup(id, data, req.user.subject_id);

    res.status(201).json(req.permission.filter(childGroup));
  }),
);

function toCapabilitiesArray(capabilitiesObj) {
  if (!capabilitiesObj || typeof capabilitiesObj !== 'object') {
    return [];
  }
  return Object.entries(capabilitiesObj)
  // eslint-disable-next-line no-unused-vars
    .filter(([_key, value]) => value === true)
    // eslint-disable-next-line no-unused-vars
    .map(([key, _value]) => key);
}

// Get group details
router.get(
  '/:id',
  validate([
    param('id').isUUID(),
  ]),
  authorize('group', 'view_metadata', { shouldDeriveCallerRole: true, shouldDeriveCapabilities: true }),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Get group details by ID'

    const { id } = req.params;
    const group = await groupService.getGroupById(id);
    res.json({
      ...req.permission.filter(group),
      // ...group,
      _meta: {
        caller_role: req.permission.callerRole,
        capabilities: toCapabilitiesArray(req.permission.capabilities),
      },
    });
  }),
);

// get group by slug
router.get(
  '/slug/:slug',
  asyncHandler(async (req, res, next) => {
  // #swagger.tags = ['Groups']
  // #swagger.summary = 'Get group details by slug'

    const { slug } = req.params;
    const group = await groupService.getGroupBySlug(slug);

    const permission = await authorizeAction('group', 'view_metadata', {
      identifiers: { group_id: group.id },
      policyExecutionContext: req.policyExecutionContext,
      preFetched: { resource: group },
      shouldDeriveCallerRole: true,
      shouldDeriveCapabilities: true,
    });

    if (!permission.granted) {
      return next(createError(403, 'Forbidden'));
    }

    res.json({
      ...permission.filter(group),
      _meta: {
        caller_role: permission.callerRole,
        capabilities: toCapabilitiesArray(permission.capabilities),
      },
    });
  }),
);

//  Update group metadata
router.patch(
  '/:id',
  validate([
    param('id').isUUID(),
    body('version').isInt({ min: 1 }).toInt(), // for optimistic concurrency control
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
        actor_id: req.user.subject_id,
        expected_version: req.body.version,
      },
    );
    res.json(req.permission.filter(updatedGroup));
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

    const archivedGroup = await groupService.archiveGroup(id, req.user.subject_id);
    res.json(req.permission.filter(archivedGroup));
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

    const unarchivedGroup = await groupService.unarchiveGroup(id, req.user.subject_id);
    res.json(req.permission.filter(unarchivedGroup));
  }),
);

// List group members
router.get(
  '/:id/members',
  validate([
    param('id').isUUID(),
    query('membership_type').default('all').isIn(['all', 'direct', 'transitive']),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
    query('only_enabled_users').default(false).isBoolean().toBoolean(),
  ]),
  authorize('group', 'view_members'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'List direct members of a group'

    const { id } = req.params;
    const {
      limit, offset, only_enabled_users, membership_type, search_term,
    } = req.query;

    const { metadata, data } = await groupService.listGroupMembers(id, {
      limit, offset, only_enabled_users, membership_type, search_term,
    });
    const filteredMembers = data.map((m) => req.permission.filter(m));
    res.json({
      metadata,
      data: filteredMembers,
    });
  }),
);

// Add member to group
router.put(
  '/:id/members/:userId',
  validate([
    param('id').isUUID(),
    param('userId').isUUID(),
  ]),
  authorize('group', 'add_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Add a member to the group'

    const { id, userId } = req.params;

    await groupService.addGroupMembers(id, { user_ids: [userId], actor_id: req.user.subject_id });
    res.status(204).send();
  }),
);

// Remove member from group
router.delete(
  '/:id/members/:userId',
  validate([
    param('id').isUUID(),
    param('userId').isUUID(),
  ]),
  authorize('group', 'remove_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Remove a member from the group'

    const { id, userId } = req.params;

    await ensureNotRemovingLastAdmin(id, userId);

    const deletedUserIds = await groupService.removeGroupMembers(
      id,
      { user_ids: [userId], actor_id: req.user.subject_id },
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
    body('members.*.user_id').isUUID(),
  ]),
  authorize('group', 'add_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Bulk add members to the group'

    const { id } = req.params;
    const { members } = req.body; // array of { user_id, role }

    await groupService.addGroupMembers(id, {
      actor_id: req.user.subject_id,
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
    param('userId').isUUID(),
  ]),
  authorize('group', 'edit_member_role'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Promote a member to admin of the group'

    const { id, userId } = req.params;

    await groupService.promoteGroupMemberToAdmin(id, { user_id: userId, actor_id: req.user.subject_id });
    res.status(204).send();
  }),
);

// Remove admin from group
router.delete(
  '/:id/admins/:userId',
  validate([
    param('id').isUUID(),
    param('userId').isUUID(),
  ]),
  authorize('group', 'edit_member_role'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Remove an admin from the group'

    const { id, userId } = req.params;

    await ensureNotRemovingLastAdmin(id, userId);

    await groupService.removeGroupAdmin(id, { user_id: userId, actor_id: req.user.subject_id });
    res.status(204).send();
  }),
);

// bulk remove members from group
router.delete(
  '/:id/members',
  validate([
    param('id').isUUID(),
    body('user_ids').isArray({ min: 1 }),
    body('user_ids.*').isUUID(),
  ]),
  authorize('group', 'remove_member'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Bulk remove members from the group'

    const { id } = req.params;
    const { user_ids } = req.body;

    // check if any of the removals would lead to zero admins in the group
    await Promise.all(user_ids.map((user_id) => ensureNotRemovingLastAdmin(id, user_id)));

    await groupService.removeGroupMembers(id, { user_ids, actor_id: req.user.subject_id });
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
    const filteredAncestors = ancestors.map((a) => req.permission.filter(a));
    res.json(filteredAncestors);
  }),
);

// Get descendant groups (hierarchy downward)
router.get(
  '/:id/descendants',
  validate([
    param('id').isUUID(),
    query('archived').optional().isBoolean().toBoolean(),
    query('max_depth').optional().isInt({ min: 1 }).toInt(),
  ]),
  authorize('group', 'view_descendants'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Get descendant groups (hierarchy downward)'

    const { id } = req.params;
    const { archived, max_depth, search_term } = req.query;
    const descendants = await groupService.getGroupDescendants(id, {
      archived,
      max_depth,
      search_term: search_term?.trim(),
    });
    const filteredDescendants = descendants.map((d) => req.permission.filter(d));
    res.json(filteredDescendants);
  }),
);

// POST /api/groups/:id/reparent
// Move group to new parent
// router.post('/:id/reparent', asyncHandler(async (req, res) => {})) - Don't implement until we have a use case for it,
// as it's complex and not currently needed

// List collections owned by group
router.get(
  '/:id/collections',
  validate([
    param('id').isUUID(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
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
    const { metadata, data } = await collectionService.findCollectionsByOwnerGroup({
      group_id: id, limit, offset, sort_by, sort_order,
    });
    const filteredCollections = data.map((c) => req.permission.filter(c));
    res.json({ metadata, data: filteredCollections });
  }),
);

// List datasets owned by group
router.get(
  '/:id/datasets',
  validate([
    param('id').isUUID(),
    query('limit').default(100).isInt({ min: 0, max: 100 }).toInt(),
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
    const { metadata, data } = await datasetService.getDatasetsByOwnerGroup({
      group_id: id, limit, offset, sort_by, sort_order,
    });
    const filteredDatasets = data.map((d) => req.permission.filter(d));
    res.json({ metadata, data: filteredDatasets });
  }),
);

module.exports = router;
