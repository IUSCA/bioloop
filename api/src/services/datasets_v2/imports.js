const path = require('node:path');
const createError = require('http-errors');

const prisma = require('@/db');
const logger = require('@/services/logger');
const importSourceService = require('@/services/import_sources');
const { createDataset, buildDatasetCreateQuery } = require('./create');
const { createWorkflow } = require('./workflows');

/**
 * Register a directory that already exists on a filesystem the API can read.
 *
 * Nothing is copied. The directory becomes the dataset's `origin_path`, and the workflow
 * archives from there.
 *
 * Three things have to hold, and each is checked here rather than trusted from the client:
 * the path lies inside an import source the caller may browse, the source is ACTIVE, and no
 * live dataset already holds that path.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — B3
 * @param {object} options
 * @param {object} options.user - the authenticated user
 * @param {object} options.data - name, type, origin_path, owner_group_id, description, metadata
 * @param {string} options.wf_name - workflow to start once the dataset exists
 * @returns {Promise<{dataset: object, workflow: object|null}>}
 */
async function importDataset({ user, data, wf_name = 'integrated' }) {
  const origin_path = path.resolve(path.normalize(data.origin_path));

  const source = await importSourceService.resolveImportSourceForUser(user, origin_path);
  if (!source) {
    // Says nothing about whether such a source exists, only that this caller cannot use it.
    throw createError.Forbidden('Path is not inside an import source you can import from');
  }
  if (source.unavailable) {
    throw createError.ServiceUnavailable(
      source.status_reason || `Import source ${source.label} is currently unavailable`,
    );
  }

  // A directory already registered by somebody else would give two datasets over the same
  // bytes, and each set of grants would expose the other's files. The refusal names neither
  // the dataset nor the group that holds it.
  const alreadyRegistered = await prisma.dataset.findFirst({
    where: { origin_path, is_deleted: false },
    select: { id: true },
  });
  if (alreadyRegistered) {
    throw createError.Conflict('That directory is already registered as a dataset');
  }

  const created = await createDataset({
    data: buildDatasetCreateQuery({
      ...data,
      origin_path,
      create_method: 'IMPORT',
      state: 'REGISTERED',
    }),
    actor_id: user.subject_id,
  });

  // createDataset is idempotent and answers null when the owning group already holds the
  // name. The route turns that into a 409 the dialog can act on.
  if (!created) return { dataset: null, workflow: null };

  await prisma.dataset_import_log.create({
    data: {
      dataset_id: created.id,
      notes: `Imported from ${source.label || source.path}`,
      metadata: { import_source_id: source.id, imported_by_user_id: user.id },
    },
  }).catch((err) => {
    // Provenance, not correctness. A dataset that imported successfully is not un-imported
    // because the log row failed.
    logger.warn('[IMPORT] could not write dataset_import_log', {
      dataset_id: created.id, error: err.message,
    });
  });

  let workflow = null;
  try {
    workflow = await createWorkflow({
      dataset: { ...created, workflows: [] },
      wf_name,
      initiator_id: user.id,
    });
  } catch (err) {
    // The dataset is registered either way. A failed workflow start is reported, and the
    // dataset page offers the workflow again rather than the import being lost.
    logger.error('[IMPORT] dataset registered but workflow did not start', {
      dataset_id: created.id, wf_name, error: err.message,
    });
  }

  return { dataset: created, workflow };
}

module.exports = { importDataset };
