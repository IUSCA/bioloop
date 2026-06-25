const prisma = require('@/db');
const CONSTANTS = require('@/constants');
const logger = require('@/services/logger');

/**
 * Returns the dataset_upload_log for a given dataset (with the dataset
 * relation included), or null if no log exists yet.
 */
async function findUploadLogForDataset(datasetId) {
  return prisma.dataset_upload_log.findFirst({
    where: { dataset_id: datasetId },
    include: { dataset: true },
  });
}

/**
 * Renames the dataset to "<name>--<id>" and soft-deletes it so its original
 * name is freed in the unique constraint (name, type, is_deleted).
 *
 * Called whenever an upload reaches a terminal failure state
 * (UPLOAD_FAILED, VERIFICATION_FAILED, PERMANENTLY_FAILED).
 *
 * Accepts an optional Prisma transaction client; falls back to the global
 * prisma client when omitted.
 *
 * Errors are caught and logged — never re-thrown, so a tombstone failure
 * never obscures the primary failure response that prompted the tombstone.
 */
async function tombstoneDataset(datasetId, tx = null) {
  const client = tx || prisma;
  try {
    const dataset = await client.dataset.findUnique({
      where: { id: datasetId },
      select: { id: true, name: true, is_deleted: true },
    });

    if (!dataset) {
      logger.warn('[TOMBSTONE] Dataset not found — skipping tombstone', { dataset_id: datasetId });
      return;
    }

    if (dataset.is_deleted) {
      logger.info('[TOMBSTONE] Dataset already tombstoned — skipping', { dataset_id: datasetId });
      return;
    }

    const tombstoneName = `${dataset.name}--${dataset.id}`;
    await client.dataset.update({
      where: { id: datasetId },
      data: { name: tombstoneName, is_deleted: true },
    });

    logger.info('[TOMBSTONE] Dataset tombstoned — name freed for re-upload', {
      dataset_id: datasetId,
      original_name: dataset.name,
      tombstone_name: tombstoneName,
    });
  } catch (err) {
    logger.error('[TOMBSTONE] Failed to tombstone dataset — name may remain reserved', {
      dataset_id: datasetId,
      error: err.message,
    });
  }
}

/**
 * Sets the dataset upload log status to UPLOAD_FAILED and records the failure
 * reason in the log's metadata, then tombstones the dataset.
 *
 * PROCESSING_FAILED is intentionally not used here: that status is reserved
 * for failures after the integrated workflow has started. An error during
 * the file-move step means files may not be at origin_path, so triggering
 * an automated workflow retry would be incorrect.
 *
 * Errors during the status update are logged but not re-thrown so the
 * caller's error response is not obscured.
 */
async function markUploadAsFailed(datasetId, error) {
  try {
    logger.info('[UPLOAD-COMPLETE] Attempting to mark upload as failed', { dataset_id: datasetId });

    const existingLog = await prisma.dataset_upload_log.findFirst({
      where: { dataset_id: datasetId },
      select: { metadata: true },
    });

    await prisma.dataset_upload_log.updateMany({
      where: { dataset_id: datasetId },
      data: {
        status: CONSTANTS.UPLOAD_STATUSES.UPLOAD_FAILED,
        metadata: {
          ...(existingLog?.metadata || {}),
          failure_reason: error.message,
        },
      },
    });

    logger.info('[UPLOAD-COMPLETE] Upload marked as UPLOAD_FAILED', { dataset_id: datasetId });
  } catch (updateError) {
    logger.error('[UPLOAD-COMPLETE] Failed to update upload log status', {
      dataset_id: datasetId,
      error: updateError.message,
    });
  }

  await tombstoneDataset(datasetId);
}

module.exports = {
  findUploadLogForDataset,
  tombstoneDataset,
  markUploadAsFailed,
};
