const config = require('config');

const prisma = require('@/db');
const CONSTANTS = require('@/constants');
const datasetService = require('./dataset');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const create_audit_log = async ({ prisma_tx, dataset_id, user_id, action }) => {
  return prisma_tx.dataset_audit.create({
    data: {
      action,
      user: { connect: { id: user_id } },
      dataset: { connect: { id: dataset_id } },
    },
  });
};

const create_state_log = async ({ prisma_tx, dataset_id, state }) => {
  return prisma_tx.dataset_state.create({
    data: {
      state,
      dataset: { connect: { id: dataset_id } },
    },
  });
};

const check_for_pending_workflows = async ({ dataset_id, statuses = [] }) => {
  const workflows = await datasetService.get_workflows({ dataset_id, statuses });
  if (workflows.length > 0) {
    throw new Error(`Dataset ${dataset_id} cannot be modified: it has pending workflows.`);
  }
};

/**
 * Transfers hierarchy, access-log, stage-log, and project-dataset associations
 * from the original dataset to its accepted duplicate.
 */
const transfer_dataset_associations = async ({ prisma_tx, original_dataset, duplicate_dataset }) => {
  await prisma_tx.dataset_hierarchy.updateMany({
    where: { source_id: original_dataset.id },
    data: { source_id: duplicate_dataset.id },
  });
  await prisma_tx.dataset_hierarchy.updateMany({
    where: { derived_id: original_dataset.id },
    data: { derived_id: duplicate_dataset.id },
  });
  await prisma_tx.data_access_log.updateMany({
    where: { dataset_id: original_dataset.id },
    data: { dataset_id: duplicate_dataset.id },
  });
  await prisma_tx.stage_request_log.updateMany({
    where: { dataset_id: original_dataset.id },
    data: { dataset_id: duplicate_dataset.id },
  });

  const associations = await prisma_tx.project_dataset.findMany({
    where: { dataset_id: original_dataset.id },
  });
  for (const assoc of associations) {
    // eslint-disable-next-line no-await-in-loop
    await prisma_tx.project_dataset.delete({
      where: { project_id_dataset_id: { dataset_id: original_dataset.id, project_id: assoc.project_id } },
    });
    // eslint-disable-next-line no-await-in-loop
    await prisma_tx.project_dataset.create({
      data: { dataset_id: duplicate_dataset.id, project_id: assoc.project_id },
    });
  }
};

/**
 * Validates the incoming duplicate is in the expected state before an operator action.
 * @returns {{ original_dataset, duplicate_dataset }}
 */
async function validate_duplication_state({ prisma_tx, duplicate_dataset_id }) {
  const duplicate_dataset = await prisma_tx.dataset.findUniqueOrThrow({
    where: { id: duplicate_dataset_id },
    include: {
      ...CONSTANTS.INCLUDE_STATES,
      ...CONSTANTS.INCLUDE_WORKFLOWS,
      ...CONSTANTS.INCLUDE_DUPLICATIONS,
    },
  });

  if (!duplicate_dataset.is_duplicate) {
    throw new Error(`Dataset ${duplicate_dataset_id} is not flagged as a duplicate.`);
  }

  const original_dataset = await prisma_tx.dataset.findUniqueOrThrow({
    where: { id: duplicate_dataset.duplicated_from.original_dataset_id },
  });

  return { original_dataset, duplicate_dataset };
}

/**
 * Validates the duplicate is in DUPLICATE_READY state before overwrite.
 */
async function validate_state_before_overwrite({ prisma_tx, duplicate_dataset_id }) {
  const { original_dataset, duplicate_dataset } = await validate_duplication_state({
    prisma_tx,
    duplicate_dataset_id,
  });

  const latest_state = duplicate_dataset.states[0]?.state;
  if (latest_state !== CONSTANTS.DATASET_STATES.DUPLICATE_READY) {
    throw new Error(
      `Dataset ${duplicate_dataset_id} must be in ${CONSTANTS.DATASET_STATES.DUPLICATE_READY} `
      + `to be accepted, but current state is ${latest_state}.`,
    );
  }

  return { original_dataset, duplicate_dataset };
}

/**
 * Rejects every other active duplicate that points at the same original as the
 * just-accepted duplicate.  Called inside the accept transaction.
 */
const reject_concurrent_active_duplicates = async ({ prisma_tx, original_dataset_id, accepted_duplicate_id, accepted_by_id }) => {
  const other_duplicates = await prisma_tx.dataset_duplication.findMany({
    where: {
      original_dataset_id,
      NOT: { duplicate_dataset_id: accepted_duplicate_id },
      duplicate_dataset: { is_deleted: false },
    },
    include: { duplicate_dataset: true },
  });

  for (const dup_record of other_duplicates) {
    const d = dup_record.duplicate_dataset;
    // eslint-disable-next-line no-await-in-loop
    await create_audit_log({ prisma_tx, dataset_id: d.id, user_id: accepted_by_id, action: 'duplicate_rejected' });
    // eslint-disable-next-line no-await-in-loop
    await create_state_log({ prisma_tx, dataset_id: d.id, state: CONSTANTS.DATASET_STATES.DUPLICATE_REJECTED });
    // eslint-disable-next-line no-await-in-loop
    await prisma_tx.dataset.update({ where: { id: d.id }, data: { is_deleted: true } });
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records that a dataset is a duplicate of an existing one.
 *
 * Called by the inspect task after duplicate candidate detection.  Creates the
 * dataset_duplication row and transitions the dataset to DUPLICATE_REGISTERED.
 *
 * @param {Object} params
 * @param {number} params.duplicate_dataset_id
 * @param {number} params.original_dataset_id
 * @param {string|null} params.comparison_process_id  Celery task ID for the compare task
 * @param {string} params.comparison_status  COMPARISON_STATUS enum value
 * @returns {Promise<Object>} The created dataset_duplication record
 */
async function register_duplicate({ duplicate_dataset_id, original_dataset_id, comparison_process_id, comparison_status }) {
  return prisma.$transaction(async (tx) => {
    // Mark the dataset as a duplicate
    await tx.dataset.update({
      where: { id: duplicate_dataset_id },
      data: { is_duplicate: true },
    });

    // Create the duplication record
    const duplication = await tx.dataset_duplication.create({
      data: {
        duplicate_dataset_id,
        original_dataset_id,
        comparison_process_id: comparison_process_id || null,
        comparison_status: comparison_status || CONSTANTS.COMPARISON_STATUSES.PENDING,
      },
      include: {
        duplicate_dataset: true,
        original_dataset: true,
      },
    });

    // Transition to DUPLICATE_REGISTERED only when it's an actual duplicate detection
    if (comparison_status !== CONSTANTS.COMPARISON_STATUSES.NOT_DUPLICATE) {
      await tx.dataset_state.create({
        data: {
          state: CONSTANTS.DATASET_STATES.DUPLICATE_REGISTERED,
          dataset_id: duplicate_dataset_id,
        },
      });
    }

    // NOTIFICATION_PLACEHOLDER: notify admins/operators of incoming duplicate dataset
    // await notify_duplicate_registered({ tx, duplicate_dataset_id, original_dataset_id });

    return duplication;
  });
}

/**
 * Persists the comparison results computed by the compare_duplicate_datasets
 * Celery task.  Updates comparison_status and advances the dataset to
 * DUPLICATE_READY so operators can act on it.
 *
 * All writes are done inside a single transaction.
 *
 * @param {Object} params
 * @param {number} params.duplicate_dataset_id
 * @param {Object} params.comparison_result
 *   {
 *     content_similarity_score: number,
 *     total_incoming_files: number,
 *     total_original_files: number,
 *     total_common_files: number,
 *     ingestion_checks: Array<{
 *       type: string,
 *       label: string,
 *       passed: boolean,
 *       file_checks: Array<{ file_id: number, source_dataset_id: number }>
 *     }>
 *   }
 */
async function save_comparison_result({ duplicate_dataset_id, comparison_result }) {
  const {
    content_similarity_score,
    total_incoming_files,
    total_original_files,
    total_common_files,
    exact_content_match_count,
    same_path_same_content_count,
    same_path_different_content_count,
    same_content_different_path_count,
    only_in_incoming_count,
    only_in_original_count,
    file_count_delta,
    path_union_file_count,
    path_preserving_similarity,
    ingestion_checks,
  } = comparison_result;

  return prisma.$transaction(async (tx) => {
    // Delete any prior comparison data for this dataset (idempotent retries)
    const existing_checks = await tx.dataset_ingestion_check.findMany({
      where: { dataset_id: duplicate_dataset_id },
      select: { id: true },
    });
    if (existing_checks.length > 0) {
      await tx.dataset_ingestion_file_check.deleteMany({
        where: { ingestion_check_id: { in: existing_checks.map((c) => c.id) } },
      });
      await tx.dataset_ingestion_check.deleteMany({
        where: { dataset_id: duplicate_dataset_id },
      });
    }

    // Write each check category and its file entries
    for (const check of ingestion_checks) {
      // eslint-disable-next-line no-await-in-loop
      const created_check = await tx.dataset_ingestion_check.create({
        data: {
          type: check.type,
          label: check.label,
          passed: check.passed,
          dataset_id: duplicate_dataset_id,
        },
      });

      if (check.file_checks && check.file_checks.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await tx.dataset_ingestion_file_check.createMany({
          data: check.file_checks.map((fc) => ({
            file_id: fc.file_id,
            source_dataset_id: fc.source_dataset_id,
            ingestion_check_id: created_check.id,
          })),
        });
      }
    }

    // Update duplication record with results and mark as COMPLETED
    await tx.dataset_duplication.update({
      where: { duplicate_dataset_id },
      data: {
        comparison_status: CONSTANTS.COMPARISON_STATUSES.COMPLETED,
        metadata: {
          content_similarity_score,
          total_incoming_files,
          total_original_files,
          total_common_files,
          exact_content_match_count: exact_content_match_count ?? total_common_files,
          same_path_same_content_count: same_path_same_content_count ?? null,
          same_path_different_content_count: same_path_different_content_count ?? null,
          same_content_different_path_count: same_content_different_path_count ?? null,
          only_in_incoming_count: only_in_incoming_count ?? null,
          only_in_original_count: only_in_original_count ?? null,
          file_count_delta: file_count_delta ?? (total_incoming_files - total_original_files),
          path_union_file_count: path_union_file_count ?? null,
          path_preserving_similarity: path_preserving_similarity ?? null,
        },
      },
    });

    // Advance to DUPLICATE_READY so operators can review
    await tx.dataset_state.create({
      data: {
        state: CONSTANTS.DATASET_STATES.DUPLICATE_READY,
        dataset_id: duplicate_dataset_id,
      },
    });

    // NOTIFICATION_PLACEHOLDER: notify admins/operators that duplicate is ready for review
    // await notify_duplicate_ready({ tx, duplicate_dataset_id });
  });
}

/**
 * Accepts an incoming duplicate dataset:
 *   - renames duplicate back to the original's name
 *   - soft-deletes the original (OVERWRITTEN state)
 *   - rejects any other concurrent duplicates of the same original
 *   - transfers all relations from original to accepted duplicate
 *
 * @param {Object} params
 * @param {number} params.duplicate_dataset_id
 * @param {number} params.accepted_by_id
 * @returns {Promise<Object>} The accepted dataset record
 */
async function accept_duplicate_dataset({ duplicate_dataset_id, accepted_by_id }) {
  // Pre-check: no pending workflows on either dataset
  const dup = await prisma.dataset.findUniqueOrThrow({
    where: { id: duplicate_dataset_id },
    include: { ...CONSTANTS.INCLUDE_DUPLICATIONS },
  });
  const original_dataset_id = dup.duplicated_from.original_dataset_id;

  await check_for_pending_workflows({
    dataset_id: original_dataset_id,
    statuses: ['PENDING', 'STARTED', 'FAILURE', 'RETRY'],
  });
  await check_for_pending_workflows({
    dataset_id: duplicate_dataset_id,
    statuses: ['PENDING', 'STARTED', 'FAILURE', 'RETRY'],
  });

  return prisma.$transaction(async (tx) => {
    const { original_dataset, duplicate_dataset } = await validate_state_before_overwrite({
      prisma_tx: tx,
      duplicate_dataset_id,
    });

    // Rename the accepted duplicate back to the original dataset's name so it
    // takes over the original's identity in the system.  The original dataset
    // will be soft-deleted below, freeing the name under the unique constraint.
    await tx.dataset.update({
      where: { id: original_dataset.id },
      data: { is_deleted: true },
    });

    await create_state_log({
      prisma_tx: tx,
      dataset_id: original_dataset.id,
      state: CONSTANTS.DATASET_STATES.OVERWRITTEN,
    });
    await create_audit_log({
      prisma_tx: tx,
      dataset_id: original_dataset.id,
      user_id: accepted_by_id,
      action: 'overwritten',
    });

    // Adopt the original dataset's canonical name and clear the duplicate flag
    await tx.dataset.update({
      where: { id: duplicate_dataset.id },
      data: {
        is_duplicate: false,
        name: original_dataset.name,
      },
    });

    await create_audit_log({
      prisma_tx: tx,
      dataset_id: duplicate_dataset.id,
      user_id: accepted_by_id,
      action: 'duplicate_accepted',
    });

    // Reject any other pending duplicates for the same original
    await reject_concurrent_active_duplicates({
      prisma_tx: tx,
      original_dataset_id: original_dataset.id,
      accepted_duplicate_id: duplicate_dataset.id,
      accepted_by_id,
    });

    // Move relations (projects, access logs, etc.) to the accepted duplicate
    await transfer_dataset_associations({
      prisma_tx: tx,
      original_dataset,
      duplicate_dataset,
    });

    return tx.dataset.findUniqueOrThrow({
      where: { id: duplicate_dataset.id },
      include: {
        ...CONSTANTS.INCLUDE_DUPLICATIONS,
        ...CONSTANTS.INCLUDE_STATES,
        ...CONSTANTS.INCLUDE_WORKFLOWS,
      },
    });
  });
}

/**
 * Rejects an incoming duplicate dataset: soft-deletes it and marks it
 * DUPLICATE_REJECTED.
 *
 * @param {Object} params
 * @param {number} params.duplicate_dataset_id
 * @param {number} params.rejected_by_id
 * @returns {Promise<Object>} The rejected dataset record
 */
async function reject_duplicate_dataset({ duplicate_dataset_id, rejected_by_id }) {
  return prisma.$transaction(async (tx) => {
    const { duplicate_dataset } = await validate_duplication_state({
      prisma_tx: tx,
      duplicate_dataset_id,
    });

    await create_audit_log({
      prisma_tx: tx,
      dataset_id: duplicate_dataset.id,
      user_id: rejected_by_id,
      action: 'duplicate_rejected',
    });
    await create_state_log({
      prisma_tx: tx,
      dataset_id: duplicate_dataset.id,
      state: CONSTANTS.DATASET_STATES.DUPLICATE_REJECTED,
    });

    return tx.dataset.update({
      where: { id: duplicate_dataset_id },
      data: { is_deleted: true },
      include: {
        ...CONSTANTS.INCLUDE_DUPLICATIONS,
        ...CONSTANTS.INCLUDE_STATES,
        ...CONSTANTS.INCLUDE_WORKFLOWS,
      },
    });
  });
}

module.exports = {
  register_duplicate,
  save_comparison_result,
  accept_duplicate_dataset,
  reject_duplicate_dataset,
};
