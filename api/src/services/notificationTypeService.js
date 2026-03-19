const { NOTIFICATION_TYPES } = require('@/constants');

/**
 * Notification type business logic lives in this service.
 *
 * Add a new typed notification by wiring all of these places:
 *
 * 1) api/src/constants.js
 *    - Add NOTIFICATION_TYPES.<YOUR_TYPE> = '<YOUR_TYPE>'
 *
 * 2) buildNotificationPayload(...)
 *    - Add a branch that calls build<YourType>Payload(...)
 *    - Expected inputs:
 *      - type: string enum from NOTIFICATION_TYPES
 *      - label/text: optional overrides (string|null)
 *      - metadata: optional object used as source-of-truth for dynamic fields
 *      - context: producer-only runtime object (for example, created entity IDs)
 *
 * 3) resolveNotificationTemplate(...)
 *    - Add a branch that calls resolve<YourType>Template(...)
 *    - Expected output:
 *      - { label: string, text: string|null, metadata: object }
 *    - metadata.links should be normalized to internal app links where possible
 *
 * 4) Producer callback (for example, dataset service create callback)
 *    - Call buildNotificationPayload({ type: NOTIFICATION_TYPES.<YOUR_TYPE>, ... })
 *    - Persist returned type/label/text/metadata in notification.create(...)
 *
 * 5) Seed script (api/src/scripts/seed-notifications.js)
 *    - Add examples for the new type so UI/E2E can validate template resolution
 *    - Include metadata._seed_key for stable fixtures
 *
 * 6) Tests / scenarios
 *    - Add E2E checks for rendered label/text/links and role behavior
 *
 * ---------------------------------------------------------------------------
 * Commented example for a second type (NOT enabled right now):
 *
 * // constants.js
 * // NOTIFICATION_TYPES.PROJECT_ARCHIVED = 'PROJECT_ARCHIVED'
 *
 * // notificationTypeService.js
 * // function resolveProjectArchivedTemplate({ label, text, metadata }) {
 * //   const metadataObj = getMetadataObject(metadata);
 * //   const projectId = Number(metadataObj.project_id);
 * //   if (!Number.isInteger(projectId) || projectId <= 0) {
 * //     return { label, text, metadata: metadataObj };
 * //   }
 * //   const resolvedLabel = label || `Project ${projectId} was archived`;
 * //   const resolvedText = text || `Project ${projectId} is now archived.`;
 * //   const links = Array.isArray(metadataObj.links)
 * //     ? metadataObj.links
 * //     : [{
 * //       id: 'view-project',
 * //       label: 'View project',
 * //       href: `/projects/${projectId}`,
 * //       trusted: true,
 * //       open_in_new_tab: false,
 * //     }];
 * //   return {
 * //     label: resolvedLabel,
 * //     text: resolvedText,
 * //     metadata: { ...metadataObj, links },
 * //   };
 * // }
 *
 * // function buildProjectArchivedPayload({ context = {}, label, text, metadata }) {
 * //   const metadataObj = getMetadataObject(metadata);
 * //   const projectId = context?.project?.id;
 * //   const resolved = resolveProjectArchivedTemplate({
 * //     label,
 * //     text,
 * //     metadata: {
 * //       ...metadataObj,
 * //       project_id: metadataObj.project_id ?? projectId,
 * //     },
 * //   });
 * //   return {
 * //     type: NOTIFICATION_TYPES.PROJECT_ARCHIVED,
 * //     label: resolved.label,
 * //     text: resolved.text,
 * //     metadata: resolved.metadata,
 * //   };
 * // }
 */

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

function resolveNotificationTemplate({ type, label, text, metadata }) {
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

function buildDatasetCreatedPayload({ context = {}, label, text, metadata }) {
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
  resolveNotificationTemplate,
  buildNotificationPayload,
};
