const _ = require('lodash/fp');

const prisma = require('@/db');
const { getMetadataObject, resolveNotificationTemplate } = require('@/services/notifications/typeService');

function hasRole(user, roleName) {
  return (user?.roles || []).includes(roleName);
}

/**
 * Sanitizes and normalizes a raw link object from notification metadata.
 * Blocks dangerous URI schemes (javascript:, data:, etc.).
 * Relative paths are always trusted; external http(s) links inherit
 * the producer's `trusted` flag (defaulting to untrusted).
 * Untrusted links force `requires_confirmation: true` and `open_in_new_tab: true`
 * so the UI can show a warning modal before navigation.
 *
 * @param {Object|null} link - Raw link from metadata.links[]
 * @param {number} idx - Position index, used as fallback id
 * @returns {{ id: string, label: string, href: string, trusted: boolean, requires_confirmation: boolean, open_in_new_tab: boolean }|null}
 */
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

/**
 * Transforms a raw notification_recipient DB row into the client-facing
 * notification shape, applying type-specific template resolution, per-role
 * label/text/link overrides and addons from metadata, and trust policy
 * to links.
 *
 * Role processing order:
 * 1. Overrides replace base label/text/links entirely per matching role.
 * 2. Addons append suffixes and extra links per matching role.
 * Both iterate the user's roles array in its natural order.
 *
 * @param {{ row: Object, user: Object }} opts
 * @returns {Object} Client-ready notification object
 */
function resolveNotificationForUser({ row, user }) {
  const userRoles = user?.roles || [];
  const canSeeResolverIdentity = hasRole(user, 'admin') || hasRole(user, 'operator');
  const typeResolved = resolveNotificationTemplate({
    type: row.notification.type,
    label: row.notification.label,
    text: row.notification.text,
    metadata: row.notification.metadata,
  });
  const metadata = getMetadataObject(typeResolved.metadata);
  const roleOverrides = getMetadataObject(metadata.role_overrides);
  const roleAddons = getMetadataObject(metadata.role_addons);
  let { label } = typeResolved;
  let { text } = typeResolved;
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

  const canGloballyDismiss = hasRole(user, 'admin') || hasRole(user, 'operator');

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
    delivery: {
      type: row.delivery_type,
      role_name: row.delivery_role?.name || null,
    },
    global_dismissal: {
      is_globally_dismissed: row.notification.is_resolved,
      dismissed_at: row.notification.resolved_at,
      dismissed_by: canSeeResolverIdentity ? row.notification.resolved_by || null : null,
    },
    can_global_dismiss: canGloballyDismiss,
    allowed_links: dedupedLinks,
    created_at: row.notification.created_at,
    updated_at: row.notification.updated_at,
  };
}

/**
 * Builds a Prisma `where` clause for querying notification_recipient rows.
 * Undefined filter values are omitted so only explicitly set filters apply.
 * Search matches against notification label or text (case-insensitive).
 *
 * @param {{ userId: number, read?: boolean, archived?: boolean, bookmarked?: boolean, globallyDismissed?: boolean, search?: string }} opts
 * @returns {Object} Prisma where clause for notification_recipient.findMany
 */
function buildNotificationWhere({
  userId,
  read,
  archived,
  bookmarked,
  globallyDismissed,
  search,
}) {
  const notificationWhere = _.omitBy(_.isUndefined)({
    is_resolved: globallyDismissed,
    OR: search ? [
      {
        label: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        text: {
          contains: search,
          mode: 'insensitive',
        },
      },
    ] : undefined,
  });
  return _.omitBy(_.isUndefined)({
    user_id: userId,
    is_read: read,
    is_archived: archived,
    is_bookmarked: bookmarked,
    notification: notificationWhere,
  });
}

/**
 * Fetches the current user's notifications with pagination and filtering.
 * Runs count + findMany in a single transaction for consistent totals.
 *
 * Query params consumed from req.query:
 *   limit (1-100, default 20), offset (>=0, default 0),
 *   read, archived, bookmarked, globally_dismissed, search
 *
 * @param {{ req: import('express').Request }} opts
 * @returns {Promise<{ items: Object[], total: number, offset: number, limit: number, has_more: boolean }>}
 */
async function fetchCurrentUserNotifications({ req }) {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const globallyDismissed = req.query.globally_dismissed ?? false;
  const where = buildNotificationWhere({
    userId: req.user.id,
    read: req.query.read,
    archived: req.query.archived,
    bookmarked: req.query.bookmarked,
    globallyDismissed,
    search: req.query.search,
  });

  const [total, notificationRows] = await prisma.$transaction([
    prisma.notification_recipient.count({
      where,
    }),
    prisma.notification_recipient.findMany({
      where,
      include: {
        notification: {
          select: {
            id: true,
            type: true,
            label: true,
            text: true,
            metadata: true,
            created_by_id: true,
            is_resolved: true,
            resolved_at: true,
            resolved_by: {
              select: {
                id: true,
                username: true,
                name: true,
              },
            },
            created_at: true,
            updated_at: true,
          },
        },
        delivery_role: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      skip: offset,
      take: limit,
    }),
  ]);

  const items = notificationRows.map((row) => resolveNotificationForUser({
    row,
    user: req.user,
  }));

  return {
    items,
    total,
    offset,
    limit,
    has_more: offset + items.length < total,
  };
}

module.exports = {
  hasRole,
  fetchCurrentUserNotifications,
};
