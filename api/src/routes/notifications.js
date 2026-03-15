const express = require('express');
const config = require('config');
const {
  query, body, param,
} = require('express-validator');
const _ = require('lodash/fp');
const createError = require('http-errors');

const prisma = require('@/db');
const asyncHandler = require('@/middleware/asyncHandler');
const { accessControl } = require('@/middleware/auth');
const { validate } = require('@/middleware/validators');

const isPermittedTo = accessControl('notifications');
const router = express.Router();

function getMetadataObject(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

function isFeatureEnabledForRole(roleName) {
  const featureSetting = config.get('enabled_features').notifications;
  if (featureSetting == null) return true;
  if (typeof featureSetting === 'boolean') return featureSetting;
  if (typeof featureSetting !== 'object') return false;
  if (!Array.isArray(featureSetting.enabledForRoles)) return false;
  return featureSetting.enabledForRoles.includes(roleName);
}

function toTrustedLink(link, idx) {
  if (!link || typeof link !== 'object') return null;
  const href = typeof link.href === 'string' ? link.href.trim() : '';
  if (!href) return null;

  const isRelative = href.startsWith('/');
  const isHttp = /^https?:\/\//i.test(href);
  if (!isRelative && !isHttp) return null;
  if (/^(javascript|data|file|vbscript):/i.test(href)) return null;

  const trusted = isRelative ? true : Boolean(link.trusted);
  return {
    id: typeof link.id === 'string' && link.id.trim() ? link.id.trim() : `link-${idx + 1}`,
    label: typeof link.label === 'string' && link.label.trim() ? link.label.trim() : href,
    href,
    trusted,
    requires_confirmation: trusted ? false : (link.requires_confirmation ?? true),
    open_in_new_tab: trusted ? Boolean(link.open_in_new_tab) : (link.open_in_new_tab ?? true),
  };
}

function resolveNotificationForUser({ row, userRoles }) {
  const metadata = getMetadataObject(row.notification.metadata);
  const roleOverrides = getMetadataObject(metadata.role_overrides);
  const roleAddons = getMetadataObject(metadata.role_addons);
  let label = row.notification.label;
  let text = row.notification.text;
  let links = Array.isArray(metadata.links) ? [...metadata.links] : [];

  userRoles.forEach((roleName) => {
    const override = getMetadataObject(roleOverrides[roleName]);
    if (typeof override.label === 'string') label = override.label;
    if (typeof override.text === 'string') text = override.text;
    if (Array.isArray(override.links)) links = [...override.links];
    if (Array.isArray(override.link_addons)) links = links.concat(override.link_addons);
  });

  userRoles.forEach((roleName) => {
    const addon = getMetadataObject(roleAddons[roleName]);
    if (typeof addon.label_suffix === 'string') label = `${label}${addon.label_suffix}`;
    if (typeof addon.text_suffix === 'string') text = `${text || ''}${addon.text_suffix}`;
    if (Array.isArray(addon.links)) links = links.concat(addon.links);
  });

  const dedupedLinks = links
    .map((link, idx) => toTrustedLink(link, idx))
    .filter(Boolean)
    .filter((link, idx, arr) => arr.findIndex((x) => x.href === link.href && x.label === link.label) === idx);

  return {
    id: row.notification.id,
    type: row.notification.type,
    label,
    text,
    metadata,
    state: {
      is_read: row.is_read,
      is_archived: row.is_archived,
      is_bookmarked: row.is_bookmarked,
    },
    allowed_links: dedupedLinks,
    created_at: row.notification.created_at,
    updated_at: row.notification.updated_at,
  };
}

router.get(
  '/',
  isPermittedTo('read'),
  validate([
    query('read').optional().isBoolean().toBoolean(),
    query('archived').optional().isBoolean().toBoolean(),
    query('bookmarked').optional().isBoolean().toBoolean(),
    query('search').optional().trim().isLength({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Get current user's notifications

    const where = _.omitBy(_.isUndefined)({
      user_id: req.user.id,
      is_read: req.query.read,
      is_archived: req.query.archived,
      is_bookmarked: req.query.bookmarked,
      notification: req.query.search ? {
        OR: [
          {
            label: {
              contains: req.query.search,
              mode: 'insensitive',
            },
          },
          {
            text: {
              contains: req.query.search,
              mode: 'insensitive',
            },
          },
        ],
      } : undefined,
    });

    const notificationRows = await prisma.notification_recipient.findMany({
      where,
      include: {
        notification: {
          select: {
            id: true,
            type: true,
            label: true,
            text: true,
            metadata: true,
            created_at: true,
            updated_at: true,
          },
        },
      });
      orderBy: {
        created_at: 'desc',
      },
    });

    const notifications = notificationRows.map((row) => resolveNotificationForUser({
      row,
      userRoles: req.user.roles || [],
    }));

    res.json(notifications);
  }),
);

router.post(
  '/',
  isPermittedTo('create'),
  validate([
    body('label').trim().notEmpty(),
    body('text').optional().isString(),
    body('type').optional().isString(),
    body('metadata').optional().isObject(),
    body('role_ids').optional().isArray(),
    body('role_ids.*').optional().isInt().toInt(),
    body('user_ids').optional().isArray(),
    body('user_ids.*').optional().isInt().toInt(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Post a notification

    const roleIds = req.body.role_ids || [];
    const userIds = req.body.user_ids || [];
    if (roleIds.length === 0 && userIds.length === 0) {
      return next(createError.BadRequest('A user or user role must be specified as the recipient of the notification'));
    }

    const createdNotification = await prisma.$transaction(async (tx) => {
      const roleRows = roleIds.length > 0 ? await tx.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, name: true },
      }) : [];
      const roleById = roleRows.reduce((acc, roleRow) => {
        acc[roleRow.id] = roleRow;
        return acc;
      }, {});

      const roleUserRows = roleIds.length > 0 ? await tx.user_role.findMany({
        where: {
          role_id: { in: roleIds },
        },
        select: {
          user_id: true,
          role_id: true,
        },
      }) : [];

      const allRequestedUserIds = Array.from(new Set([
        ...userIds,
        ...roleUserRows.map((row) => row.user_id),
      ]));
      const users = allRequestedUserIds.length > 0 ? await tx.user.findMany({
        where: {
          id: {
            in: allRequestedUserIds,
          },
        },
        include: {
          user_role: {
            select: {
              roles: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }) : [];
      const userById = users.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});

      const recipientMap = new Map();
      roleUserRows.forEach((row) => {
        const user = userById[row.user_id];
        const role = roleById[row.role_id];
        if (!user || !role || !isFeatureEnabledForRole(role.name)) return;
        const userRoles = user.user_role.map((ur) => ur.roles.name);
        const isUserEligible = userRoles.some((roleName) => isFeatureEnabledForRole(roleName));
        if (!isUserEligible) return;
        if (!recipientMap.has(row.user_id)) {
          recipientMap.set(row.user_id, {
            user_id: row.user_id,
            delivery_type: 'ROLE_BROADCAST',
            delivery_role_id: row.role_id,
          });
        }
      });

      userIds.forEach((id) => {
        const user = userById[id];
        if (!user) return;
        const userRoles = user.user_role.map((ur) => ur.roles.name);
        const isUserEligible = userRoles.some((roleName) => isFeatureEnabledForRole(roleName));
        if (!isUserEligible) return;
        recipientMap.set(id, {
          user_id: id,
          delivery_type: 'DIRECT',
          delivery_role_id: null,
        });
      });

      const recipientRows = Array.from(recipientMap.values());
      if (recipientRows.length === 0) {
        throw createError.BadRequest('No eligible recipients found for notifications feature');
      }

      return tx.notification.create({
        data: {
          type: req.body.type,
          label: req.body.label,
          text: req.body.text,
          metadata: req.body.metadata,
          created_by_id: req.user.id,
          recipients: {
            createMany: {
              data: recipientRows,
            },
          },
        },
      });
    });

    res.json(createdNotification);
  }),
);

router.patch(
  '/:id/state',
  isPermittedTo('update'),
  validate([
    param('id').isInt().toInt(),
    body('is_read').optional().isBoolean().toBoolean(),
    body('is_archived').optional().isBoolean().toBoolean(),
    body('is_bookmarked').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Update current user's per-notification state

    const hasStateUpdate = ['is_read', 'is_archived', 'is_bookmarked'].some((key) => req.body[key] !== undefined);
    if (!hasStateUpdate) {
      return next(createError.BadRequest('At least one state field must be provided'));
    }

    const data = _.omitBy(_.isUndefined)({
      is_read: req.body.is_read,
      read_at: req.body.is_read === undefined ? undefined : (req.body.is_read ? new Date() : null),
      is_archived: req.body.is_archived,
      archived_at: req.body.is_archived === undefined ? undefined : (req.body.is_archived ? new Date() : null),
      is_bookmarked: req.body.is_bookmarked,
      bookmarked_at: req.body.is_bookmarked === undefined ? undefined : (req.body.is_bookmarked ? new Date() : null),
    });

    const recipient = await prisma.notification_recipient.findUnique({
      where: {
        notification_id_user_id: {
          notification_id: req.params.id,
          user_id: req.user.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!recipient) {
      return next(createError.NotFound('Notification not found for current user'));
    }

    const updated = await prisma.notification_recipient.update({
      where: {
        notification_id_user_id: {
          notification_id: req.params.id,
          user_id: req.user.id,
        },
      },
      data: {
        ...data,
      },
    });

    return res.json({
      notification_id: req.params.id,
      user_id: req.user.id,
      state: {
        is_read: updated.is_read,
        is_archived: updated.is_archived,
        is_bookmarked: updated.is_bookmarked,
      },
    });
  }),
);

router.delete(
  '/',
  isPermittedTo('delete'),
  validate([
    query('read').optional().isBoolean().toBoolean(),
    query('archived').optional().isBoolean().toBoolean(),
    query('bookmarked').optional().isBoolean().toBoolean(),
    query('search').optional().trim().isLength({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['notifications']
    // #swagger.summary = Archive matching notifications for current user
    const where = _.omitBy(_.isUndefined)({
      user_id: req.user.id,
      is_read: req.query.read,
      is_archived: req.query.archived,
      is_bookmarked: req.query.bookmarked,
      notification: req.query.search ? {
        OR: [
          {
            label: {
              contains: req.query.search,
              mode: 'insensitive',
            },
          },
          {
            text: {
              contains: req.query.search,
              mode: 'insensitive',
            },
          },
        ],
      } : undefined,
    });

    const updatedCount = await prisma.notification_recipient.updateMany({
      where,
      data: {
        is_archived: true,
        archived_at: new Date(),
      },
    });

    res.json(updatedCount);
  }),
);

module.exports = router;
