/**
 * Notification type resolution and payload builders.
 *
 * Each notification type (e.g. DATASET_CREATED) has:
 *   - A resolver: derives display label/text/links from metadata when
 *     the stored fields are null or incomplete (template expansion).
 *   - A builder: constructs the full payload for creating a new
 *     notification of that type, merging caller-supplied overrides
 *     with type-specific defaults.
 *
 * Unrecognized types pass through with no transformation.
 */
const { NOTIFICATION_TYPES } = require('@/constants');

/** @returns {Object} Guaranteed plain object (empty {} if input is falsy/array/primitive) */
function getMetadataObject(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

function getDatasetCreatedLink(datasetId) {
  return {
    id: 'view-dataset',
    label: 'View dataset',
    href: `/datasets/${datasetId}`,
    trusted: true,
    open_in_new_tab: false,
  };
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
  return {
    label,
    text,
    metadata: getMetadataObject(metadata),
  };
}

/**
 * Builds a creation payload for DATASET_CREATED notifications.
 * Merges context-derived dataset_id/dataset_type into metadata, then
 * delegates to the template resolver for label/text/link defaults.
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

  return {
    type,
    label,
    text,
    metadata: metadata || undefined,
  };
}

module.exports = {
  getMetadataObject,
  resolveNotificationTemplate,
  buildNotificationPayload,
};
