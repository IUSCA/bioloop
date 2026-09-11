const express = require('express');
const multer = require('multer');
const fsPromises = require('fs/promises');
const { param, query, body } = require('express-validator');
const createError = require('http-errors');
const _ = require('lodash/fp');
const assert = require('assert');
const { isUUID } = require('validator');
const { GROUP_MEMBER_ROLE, INVITATION_STATUS } = require('@prisma/client');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const groupService = require('@/services/groups');
const auditService = require('@/services/audit');
const profileService = require('@/services/profiles');
const avatarService = require('@/services/profiles/avatar');
const invitationService = require('@/services/invitations');
const { createAuthorizationMiddleware: authorize, authorizeAction, toCapabilitiesArray } = require('@/authorization');
const { pickNonNil } = require('@/utils');
const prisma = require('@/db');
const { isPlatformAdmin } = require('@/services/auth');
// const collectionService = require('@/services/collections');
// const datasetService = require('@/services/datasets_v2');

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
    where: { group_id, role: GROUP_MEMBER_ROLE.ADMIN, removed_at: null },
  });
  const message = 'Cannot remove the only admin from the group.'
        + ' Please promote another member to admin before removing this member.';
  if (groupAdmins.length === 1 && groupAdmins[0].user_id === user_id) {
    assert.fail(message);
  }
}

// Search groups by name or description
router.post(
  '/search',
  validate([
    body('search_term').isString().optional(),
    body('limit').default(100).isInt({ min: 1, max: 100 }).toInt(),
    body('offset').default(0).isInt({ min: 0 }).toInt(),
    body('sort_by').default('depth').isIn(['name', 'created_at', 'updated_at', 'depth']),
    body('sort_order').default('asc').isIn(['asc', 'desc']),
    body('is_archived').optional().isBoolean(),
    body('scope').default('all').isIn(['all', 'direct', 'oversight', 'admin']),
  ]),
  authorize('group', 'list'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Search groups by name or description'

    const params = _.pick([
      'search_term', 'limit', 'offset', 'sort_by', 'sort_order',
      'is_archived', 'scope',
    ])(req.body);

    // check if search term is a valid UUID, if so, search by id instead of name/description
    if (params.search_term && isUUID(params.search_term)) {
      params.group_id = params.search_term;
      delete params.search_term;
    }

    // if user is platform admin, search all groups, otherwise search only groups the user has access to
    let promise;
    if (isPlatformAdmin(req)) {
      promise = groupService.searchAllGroups({
        ...params, user_id: req.user.subject_id,
      });
    } else {
      promise = groupService.searchGroupsForUser({
        ...params, user_id: req.user.subject_id,
      });
    }
    const { metadata, data } = await promise;
    const filteredGroups = data.map((g) => req.permission.filter(g));
    res.json({ metadata, data: filteredGroups });
  }),
);

// For platform admin use - get groups that do not have an active admin (e.g. for cleanup purposes)
router.get(
  '/without-active-admin',
  authorize('group', 'list_invalid'),
  asyncHandler(async (req, res) => {
  // #swagger.tags = ['Groups']
  // #swagger.summary = 'Get groups without an active admin'

    const groups = await groupService.getGroupsWithoutActiveAdmins();
    const filteredGroups = groups.map((g) => req.permission.filter(g));
    res.json(filteredGroups);
  }),
);

// Create a new root group
router.post(
  '/',
  authorize('group', 'create'),
  validate([
    body('name').isString().notEmpty(),
    body('description').optional().isString().notEmpty(),
    body('allow_user_contributions').optional().isBoolean().toBoolean(),
    body('members').optional().isArray(),
    body('members.*').isUUID(),
    body('admins').optional().isArray(),
    body('admins.*').isUUID(),
  ]),
  asyncHandler(async (req, res) => {
  // #swagger.tags = ['Groups']
  // #swagger.summary = 'Create a new root group'

    const data = pickNonNil(['name', 'description', 'allow_user_contributions', 'metadata'])(req.body);
    const { members = [], admins = [] } = req.body;
    const group = await groupService.createGroup({
      data,
      actor_id: req.user.subject_id,
      members,
      admins,
    });

    res.status(201).json(req.permission.filter(group));
  }),
);

// get hierarchical listing of groups with optional filters
router.post(
  '/hierarchy',
  validate([
    body('is_archived').optional().isBoolean().toBoolean(),
    body('search_term').optional().isString(),
    body('root_limit').default(10).isInt({ min: 1, max: 100 }).toInt(),
    body('root_offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  authorize('group', 'view_hierarchy'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Get hierarchical listing of groups with optional filters'

    const params = _.pick(['is_archived', 'search_term', 'root_limit', 'root_offset'])(req.body);

    // results: [{ group info, _children: [{ group info, _children: [...] }, ...] }, ...]
    const results = await groupService.getGroupHierarchy(params);

    const filterHierarchy = (group) => {
      const filtered = req.permission.filter(_.omit(['_children'], group));
      if (Array.isArray(group._children) && group._children.length > 0) {
        filtered._children = group._children.map(filterHierarchy);
      }
      return filtered;
    };

    const filteredResults = results.map(filterHierarchy);
    res.json(filteredResults);
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
    body('members').optional().isArray(),
    body('members.*').isUUID(),
    body('admins').optional().isArray(),
    body('admins.*').isUUID(),
  ]),
  authorize('group', 'create_child'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Create a new child group under a parent group'

    const { id } = req.params;
    const data = pickNonNil(['name', 'description', 'allow_user_contributions', 'metadata'])(req.body);
    const { members = [], admins = [] } = req.body;

    // if not platform admin, add user as admin of the child group by default to ensure they have access to manage the child group they created
    if (!isPlatformAdmin(req) && !admins.includes(req.user.subject_id)) {
      admins.push(req.user.subject_id);
    }

    const childGroup = await groupService.createGroup({
      data,
      actor_id: req.user.subject_id,
      parent_id: id,
      members,
      admins,
    });

    res.status(201).json(req.permission.filter(childGroup));
  }),
);

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
      // Derived from the name, the year, and the public URL, so it carries nothing the
      // caller could not already see. @see docs/design/groups/profiles.md — Schema
      citation: profileService.resolveCitation(group, 'groups'),
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

// Update the group profile. Same authority as any other metadata edit — a profile is
// informational, so publishing one is not a governance action.
// @see docs/design/groups/profiles.md — API
router.patch(
  '/:id/profile',
  validate([
    param('id').isUUID(),
    body('version').isInt({ min: 1 }).toInt(),
    body('tagline').optional({ nullable: true }),
    body('about_md').optional({ nullable: true }),
    body('profile_visibility').optional().isString(),
    body('links').optional({ nullable: true }).isArray(),
    body('citation').optional({ nullable: true }),
    body('publications').optional({ nullable: true }).isArray(),
  ]),
  authorize('group', 'edit_metadata'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Update the group profile'
    const updated = await profileService.updateGroupProfile(req.params.id, {
      data: req.body,
      actor_id: req.user.subject_id,
      expected_version: req.body.version,
    });
    res.json(req.permission.filter(updated));
  }),
);

const avatarUpload = multer({
  storage: multer.diskStorage({
    async destination(req, file, cb) {
      try {
        await fsPromises.mkdir(avatarService.avatarDir(), { recursive: true });
        cb(null, avatarService.avatarDir());
      } catch (e) {
        cb(e);
      }
    },
    filename(req, file, cb) {
      try {
        cb(null, avatarService.newAvatarKey(file.originalname));
      } catch (e) {
        cb(e);
      }
    },
  }),
  limits: { fileSize: avatarService.AVATAR_MAX_BYTES, files: 1 },
});

// Replace the group's profile picture.
router.put(
  '/:id/avatar',
  validate([param('id').isUUID()]),
  authorize('group', 'edit_metadata'),
  avatarUpload.single('avatar'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Replace the group profile picture'
    if (!req.file) return next(createError.BadRequest('No image was uploaded.'));

    const current = await prisma.group.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { avatar_key: true },
    });
    const updated = await prisma.group.update({
      where: { id: req.params.id },
      data: { avatar_key: req.file.filename },
      select: { id: true, avatar_key: true },
    });
    // Only after the new key is committed, so a failure leaves the old picture serving.
    await avatarService.removeAvatar(current.avatar_key);
    return res.json(updated);
  }),
);

// Remove the group's profile picture. The profile falls back to the group icon.
router.delete(
  '/:id/avatar',
  validate([param('id').isUUID()]),
  authorize('group', 'edit_metadata'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Remove the group profile picture'
    const current = await prisma.group.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { avatar_key: true },
    });
    await prisma.group.update({
      where: { id: req.params.id },
      data: { avatar_key: null },
    });
    await avatarService.removeAvatar(current.avatar_key);
    res.json({ id: req.params.id, avatar_key: null });
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
  // Not the same policy as archiving. Archiving gives up authority and a group admin may do
  // it; unarchiving takes authority back and is platform admin only.
  authorize('group', 'unarchive'),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Unarchive a group'

    const { id } = req.params;

    const unarchivedGroup = await groupService.unarchiveGroup(id, req.user.subject_id);
    res.json(req.permission.filter(unarchivedGroup));
  }),
);

// ── Invitations ──────────────────────────────────────────────────────────────
//
// An invitation reaches an email address rather than a user, so these routes never take a
// user id and never say whether the address has an account.
// @see docs/design/groups/invitations.md — API Reference

// Invite an email address to the group
router.post(
  '/:id/invitations',
  validate([
    param('id').isUUID(),
    body('email')
      .isString()
      .trim()
      .notEmpty()
      .isLength({ max: 254 }),
    body('role').optional().isIn(Object.values(GROUP_MEMBER_ROLE)),
  ]),
  authorize('group', 'invite'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Invite an email address to join the group'

    const { status, invitation } = await invitationService.createInvitation({
      group_id: req.params.id,
      email: req.body.email,
      role: req.body.role,
      invited_by: req.user.subject_id,
    });

    // The same body either way, and no hint about whether the address has an account. An
    // admin who could tell the difference could enumerate the portal's users one at a time.
    res.status(status === 'invited' ? 201 : 200).json({ status, id: invitation.id });
  }),
);

// List the group's invitations
router.get(
  '/:id/invitations',
  validate([
    param('id').isUUID(),
    query('status').default(INVITATION_STATUS.PENDING).isIn([...Object.values(INVITATION_STATUS), 'all']),
    query('limit').default(50).isInt({ min: 1, max: 100 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  authorize('group', 'view_invitations'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'List invitations issued by this group'

    const { status, limit, offset } = req.query;
    res.json(await invitationService.listInvitations({
      group_id: req.params.id,
      status: status === 'all' ? null : status,
      limit,
      offset,
    }));
  }),
);

// Withdraw an open invitation
router.delete(
  '/:id/invitations/:invitationId',
  validate([
    param('id').isUUID(),
    param('invitationId').isUUID(),
  ]),
  authorize('group', 'invite'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Cancel an open invitation'

    // group_id is part of the match inside the service, not only of the authorization here.
    // Holding another group's invitation id would otherwise be enough to cancel it.
    const invitation = await invitationService.cancelInvitation({
      group_id: req.params.id,
      invitation_id: req.params.invitationId,
    });
    res.json({ id: invitation.id, status: invitation.status });
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

/**
 * Audit records for one group.
 *
 * Scoped to this group and authorized by `group.view_audit_logs`, so the owning group's
 * admins and oversight authorities can read it. The platform-wide `GET /audit/records` stays
 * platform-admin only; it answers a different question and cannot be scoped by the caller's
 * authority.
 *
 * @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
 */
router.get(
  '/:id/audit',
  validate([
    param('id').isUUID(),
    query('event_type').optional().isString().trim(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('sort_order').default('desc').isIn(['asc', 'desc']),
    query('limit').default(50).isInt({ min: 1, max: 500 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  authorize('group', 'view_audit_logs'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Audit records for a group'

    const {
      event_type, start_date, end_date, sort_order, limit, offset,
    } = req.query;

    const result = await auditService.getResourceAuditRecords({
      resource_id: req.params.id,
      event_type,
      start_date,
      end_date,
      sort_order,
      limit,
      offset,
    });

    res.json(result);
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
    // #swagger.summary = 'Demote an admin to a member of the group'

    const { id, userId } = req.params;

    await ensureNotRemovingLastAdmin(id, userId);

    await groupService.demoteAdminToMember(id, { user_id: userId, actor_id: req.user.subject_id });
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
    query('is_archived').optional().isBoolean().toBoolean(),
    query('max_depth').optional().isInt({ min: 1 }).toInt(),
  ]),
  authorize('group', 'view_descendants'),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Groups']
    // #swagger.summary = 'Get descendant groups (hierarchy downward)'

    const { id } = req.params;
    const { is_archived, max_depth, search_term } = req.query;
    const descendants = await groupService.getGroupDescendants(id, {
      is_archived,
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
// use search collections endpoint with owner_group_id filter instead of implementing a separate endpoint for this, since the search endpoint already supports pagination, sorting, and filtering, and we can leverage that for listing collections owned by a group without needing to implement those features again in this endpoint

// List datasets owned by group
// use search datasets endpoint with owner_group_id filter instead of implementing a separate endpoint for this, since the search endpoint already supports pagination, sorting, and filtering, and we can leverage that for listing datasets owned by a group without needing to implement those features again in this endpoint

module.exports = router;
