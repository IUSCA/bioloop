/**
 * Notification type resolution, payload builders, and transactional creation.
 *
 * Each notification type (e.g. DATASET_CREATED) has:
 *   - A resolver: derives display label/text/links from metadata when
 *     the stored fields are null or incomplete (template expansion).
 *   - A builder: constructs the full payload for creating a new
 *     notification of that type, merging caller-supplied overrides
 *     with type-specific defaults.
 *
 * Type strings live in `api/src/constants.js` (`NOTIFICATION_TYPES`), not in the DB.
 * System-created notifications resolve broadcast roles via `NOTIFICATIONS_TYPES_ROLE_MAP`.
 *
 * Unrecognized types pass through with no transformation.
 */
const featureService = require('@/services/features');
const { NOTIFICATION_TYPES, NOTIFICATIONS_TYPES_ROLE_MAP } = require('@/constants');

/** @returns {Object} Guaranteed plain object (empty {} if input is falsy/array/primitive) */
function getMetadataObject(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

/**
 * Role-broadcast recipient rows for the given role names. Order in `roles`
 * defines precedence when a user appears under multiple roles: the first
 * role wins for `delivery_role_id`, and each user appears at most once.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string[]} roles - Role `name` values (e.g. `['admin', 'operator']`).
 */
async function getRoleBroadcastRecipientRows(tx, roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return [];
  }
  const seenUserIds = new Set();
  const rows = [];
  for (const roleName of roles) {
    const role = await tx.role.findFirst({
      where: { name: roleName },
      select: { id: true },
    });
    if (!role) {
      continue;
    }
    const members = await tx.user_role.findMany({
      where: { role_id: role.id },
      select: { user_id: true },
    });
    for (const { user_id } of members) {
      if (seenUserIds.has(user_id)) {
        continue;
      }
      seenUserIds.add(user_id);
      rows.push({
        user_id,
        delivery_type: 'ROLE_BROADCAST',
        delivery_role_id: role.id,
      });
    }
  }
  return rows;
}

/**
 * Builds a link to the dataset details page for the given dataset ID.
 * @param {number} datasetId - The ID of the dataset.
 * @param {string} [label]
 * @returns {Object} The link object.
 */
function buildDatasetLink(datasetId, label = 'View dataset') {
  return {
    id: `view-dataset-${datasetId}`,
    label,
    href: `/datasets/${datasetId}`,
    trusted: true,
    open_in_new_tab: false,
  };
}

function getDatasetCreatedLink(datasetId) {
  return buildDatasetLink(datasetId, 'View dataset');
}

/**
 * Template resolver for DATASET_CREATED notifications.
 * Falls back to generated label/text/links when the stored fields are
 * null, using dataset_id and dataset_type from metadata.
 */
function resolveDatasetCreatedTemplate({ label, text, metadata }) {
  const metadataObj = getMetadataObject(metadata);
  const datasetId = Number(metadataObj.dataset_id);
  if (!Number.isInteger(datasetId) || datasetId <= 0) {
    return { label, text, metadata: metadataObj };
  }

  const datasetType = metadataObj.dataset_type || 'DATASET';
  const resolvedLabel = label || `${datasetType} ${datasetId} was created`;
  const resolvedText = text || `Dataset ${datasetId} is now available.`;
  const links = Array.isArray(metadataObj.links)
    ? metadataObj.links
    : [getDatasetCreatedLink(datasetId)];

  return {
    label: resolvedLabel,
    text: resolvedText,
    metadata: {
      ...metadataObj,
      links,
    },
  };
}

/**
 * Template resolver for INCOMING_DUPLICATE_DATASET notifications.
 */
function resolveIncomingDuplicateDatasetTemplate({ label, text, metadata }) {
  const metadataObj = getMetadataObject(metadata);
  const dupId = Number(metadataObj.duplicate_dataset_id);
  const origId = Number(metadataObj.original_dataset_id);
  if (!Number.isInteger(dupId) || dupId <= 0 || !Number.isInteger(origId) || origId <= 0) {
    return { label, text, metadata: metadataObj };
  }

  const dupName = metadataObj.duplicate_dataset_name || `dataset ${dupId}`;
  const origName = metadataObj.original_dataset_name || `dataset ${origId}`;
  const resolvedLabel = label || `Possible duplicate: ${dupName}`;
  const resolvedText = text
    || `Incoming dataset may match "${origName}". Open the duplicate dataset to review the comparison.`;
  const links = Array.isArray(metadataObj.links)
    ? metadataObj.links
    : [
      buildDatasetLink(dupId, 'Review duplicate'),
      buildDatasetLink(origId, 'View original dataset'),
    ];

  return {
    label: resolvedLabel,
    text: resolvedText,
    metadata: {
      ...metadataObj,
      links,
    },
  };
}

/**
 * Resolves stored notification fields into display-ready values by
 * delegating to the appropriate type-specific template resolver.
 * Called at read time (not write time) so that template logic can
 * evolve without migrating stored rows.
 *
 * @param {{ type: string|null, label: string|null, text: string|null, metadata: Object|null }} opts
 * @returns {{ label: string|null, text: string|null, metadata: Object }}
 */
function resolveNotificationTemplate({
  type, label, text, metadata,
}) {
  if (type === NOTIFICATION_TYPES.DATASET_CREATED) {
    return resolveDatasetCreatedTemplate({
      label,
      text,
      metadata,
    });
  }
  if (type === NOTIFICATION_TYPES.INCOMING_DUPLICATE_DATASET) {
    return resolveIncomingDuplicateDatasetTemplate({
      label,
      text,
      metadata,
    });
  }
  return {
    label,
    text,
    metadata: getMetadataObject(metadata),
  };
}

/**
 * Builds a creation payload for DATASET_CREATED notifications.
 */
function buildDatasetCreatedPayload({
  context = {}, label, text, metadata,
}) {
  const metadataObj = getMetadataObject(metadata);
  const datasetId = context?.dataset?.id;
  const datasetType = context?.dataset?.type || 'DATASET';
  const nextMetadata = {
    ...metadataObj,
    dataset_id: metadataObj.dataset_id ?? datasetId,
    dataset_type: metadataObj.dataset_type ?? datasetType,
  };
  const resolved = resolveDatasetCreatedTemplate({
    label,
    text,
    metadata: nextMetadata,
  });
  return {
    type: NOTIFICATION_TYPES.DATASET_CREATED,
    label: resolved.label,
    text: resolved.text,
    metadata: resolved.metadata,
  };
}

/**
 * Builds a creation payload for INCOMING_DUPLICATE_DATASET notifications.
 */
function buildIncomingDuplicateDatasetPayload({
  context = {}, label, text, metadata,
}) {
  const metadataObj = getMetadataObject(metadata);
  const dup = context.duplicate_dataset;
  const orig = context.original_dataset;
  const nextMetadata = {
    ...metadataObj,
    duplicate_dataset_id: metadataObj.duplicate_dataset_id ?? dup?.id,
    original_dataset_id: metadataObj.original_dataset_id ?? orig?.id,
    duplicate_dataset_name: metadataObj.duplicate_dataset_name ?? dup?.name,
    original_dataset_name: metadataObj.original_dataset_name ?? orig?.name,
    duplicate_dataset_type: metadataObj.duplicate_dataset_type ?? dup?.type,
    original_dataset_type: metadataObj.original_dataset_type ?? orig?.type,
  };
  const resolved = resolveIncomingDuplicateDatasetTemplate({
    label,
    text,
    metadata: nextMetadata,
  });
  return {
    type: NOTIFICATION_TYPES.INCOMING_DUPLICATE_DATASET,
    label: resolved.label,
    text: resolved.text,
    metadata: resolved.metadata,
  };
}

/**
 * Constructs a complete notification payload suitable for
 * `prisma.notification.create`. Delegates to the type-specific
 * builder which merges context-derived defaults with any
 * explicit overrides from the caller.
 *
 * @param {{ type?: string, label?: string, text?: string, metadata?: Object, context?: Object }} opts
 * @returns {{ type: string|null, label: string|null, text: string|null, metadata: Object|undefined }}
 */
function buildNotificationPayload({
  type = null,
  label = null,
  text = null,
  metadata = null,
  context = {},
}) {
  if (type === NOTIFICATION_TYPES.DATASET_CREATED) {
    return buildDatasetCreatedPayload({
      context,
      label,
      text,
      metadata,
    });
  }
  if (type === NOTIFICATION_TYPES.INCOMING_DUPLICATE_DATASET) {
    return buildIncomingDuplicateDatasetPayload({
      context,
      label,
      text,
      metadata,
    });
  }

  return {
    type,
    label,
    text,
    metadata: metadata || undefined,
  };
}

/**
 * Creates a notification inside an existing transaction: resolves recipients,
 * builds the type-specific payload, and persists the row. No-op when the
 * notifications feature is off, the type has no role mapping, or there are
 * no eligible recipients.
 *
 * @param {Object} opts
 * @param {import('@prisma/client').Prisma.TransactionClient} opts.tx
 * @param {string} opts.type - `NOTIFICATION_TYPES` value
 * @param {Object} [opts.context] - Type-specific context (e.g. `{ dataset }`, `{ duplicate_dataset, original_dataset }`)
 * @param {number|null} [opts.created_by_id]
 * @param {string|null} [opts.label]
 * @param {string|null} [opts.text]
 * @param {Object|null} [opts.metadata]
 */
async function createNotificationForType({
  tx,
  type,
  context = {},
  created_by_id = null,
  label = null,
  text = null,
  metadata = null,
}) {
  if (!featureService.isFeatureEnabled({ key: 'notifications' })) {
    return;
  }
  const rolesForType = NOTIFICATIONS_TYPES_ROLE_MAP[type];
  if (!Array.isArray(rolesForType) || rolesForType.length === 0) {
    return;
  }
  const recipientRows = await getRoleBroadcastRecipientRows(tx, rolesForType);
  if (recipientRows.length === 0) {
    return;
  }

  const payload = buildNotificationPayload({
    type,
    context,
    label,
    text,
    metadata,
  });

  await tx.notification.create({
    data: {
      ...payload,
      created_by_id,
      recipients: {
        createMany: {
          data: recipientRows,
        },
      },
    },
  });
}

module.exports = {
  getMetadataObject,
  resolveNotificationTemplate,
  buildNotificationPayload,
  createNotificationForType,
};
