const path = require('node:path');
const config = require('config');

const prisma = require('@/db');
const logger = require('@/services/logger');
const CONSTANTS = require('@/constants');
const { createDataset, buildDatasetCreateQuery } = require('./create');

// Where uploaded files end up, per dataset type. Copied from the legacy route rather than
// shared, because it is inline there and no existing service owns it. The format is fixed by
// data already on disk, so the copy cannot drift.
// Record the duplication for cut-over: docs/design/v2-cutover.md.
const UPLOAD_SUBDIR_BY_TYPE = {
  RAW_DATA: 'raw_data',
  DATA_PRODUCT: 'data_products',
};

/**
 * Where an uploaded dataset's files will be moved to once the transfer finishes.
 *
 * `<upload dir>/{raw_data|data_products}/{id}/{name}`. Deterministic, and computed at
 * registration rather than at completion, so nothing downstream has to wait for the transfer
 * to know the path.
 *
 * Built on `upload.host_dir`, the upload directory as the workers see it, because a worker
 * archives from origin_path later. It falls back to `upload.api_dir`, which is every
 * deployment where the API and the workers reach the filesystem by the same path.
 *
 * Already keyed by dataset id, so two groups uploading the same name do not collide.
 *
 * @see docs/design/groups/dataset-storage.md — The four locations
 */
function buildUploadOriginPath({ id, name, type }) {
  const base = config.get('upload.host_dir') || config.get('upload.api_dir');
  return path.join(base, UPLOAD_SUBDIR_BY_TYPE[type], `${id}`, name);
}

/**
 * Register a dataset that is about to be uploaded from a browser.
 *
 * The dataset row, its origin_path, and its upload log are written in one transaction, so
 * there is never a dataset whose upload nobody is tracking. The transfer itself is the TUS
 * server's job, and `onUploadCreate` in `services/upload/UploadService.js` authorizes it.
 *
 * @see docs/design/groups/dataset-creation.md — The import and upload routes
 * @param {object} options
 * @param {object} options.user - the authenticated user
 * @param {object} options.data - name, type, owner_group_id, description, metadata
 * @returns {Promise<object|null>} the upload log with its dataset, or null when the owning
 *   group already holds the name
 */
async function registerUpload({ user, data }) {
  return prisma.$transaction(async (tx) => {
    const created = await createDataset({
      tx,
      data: buildDatasetCreateQuery({
        ...data,
        user_id: user.id,
        create_method: CONSTANTS.DATASET_CREATE_METHODS.UPLOAD,
      }),
      actor_id: user.subject_id,
    });

    // createDataset is idempotent and answers null when the name is taken in this group.
    if (!created) return null;

    const origin_path = buildUploadOriginPath(created);

    await tx.dataset.update({
      where: { id: created.id },
      data: { origin_path },
    });

    const upload_log = await tx.dataset_upload_log.create({
      data: {
        status: CONSTANTS.UPLOAD_STATUSES.UPLOADING,
        dataset: { connect: { id: created.id } },
      },
      include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
    });

    logger.info('[UPLOAD v2] registered', {
      dataset_id: created.id, owner_group_id: created.owner_group_id, origin_path,
    });

    return upload_log;
  });
}

/**
 * The upload log for one dataset, with its files.
 *
 * v2 needs its own read because the legacy upload routes are gated by the old role-based
 * middleware, and a contributor who is not an administrator would be refused there.
 *
 * @see docs/design/groups/dataset-creation.md — Watching an upload afterwards
 */
async function getUploadLog(dataset_row_id) {
  return prisma.dataset_upload_log.findUnique({
    where: { dataset_id: dataset_row_id },
    include: CONSTANTS.INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
  });
}

module.exports = { registerUpload, getUploadLog, buildUploadOriginPath };
