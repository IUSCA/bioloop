const { PrismaClient } = require('@prisma/client');
const config = require('config');

const CONSTANTS = require('../constants');
const datasetService = require('./dataset');

const prisma = new PrismaClient();

/**
 * Validates that the datasets associated with a duplication are in a valid state.
 * @param duplicate_dataset_id id of a duplicate dataset
 * @param prisma_transaction_instance
 * @returns tuple containing the original the duplicate datasets
 */
async function validate_duplication_state({ prisma_transaction_instance, duplicate_dataset_id }) {
  const duplicate_dataset = await prisma_transaction_instance.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: {
      ...CONSTANTS.INCLUDE_STATES,
      ...CONSTANTS.INCLUDE_WORKFLOWS,
      ...CONSTANTS.INCLUDE_DUPLICATIONS,
    },
  });

  if (!duplicate_dataset.is_duplicate) {
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be a duplicate, but it is not.`);
  }

  const original_dataset = await prisma_transaction_instance.dataset.findUnique({
    where: {
      id: duplicate_dataset.duplicated_from.original_dataset_id,
    },
  });

  return { original_dataset, duplicate_dataset };
}

/**
 * Performs sanity checks regarding the states of the
 * datasets associated with a duplication,
 * before the original dataset's resources are purged.
 *
 * @param prisma_transaction_instance
 * @param {Number} duplicate_dataset_id The duplicate dataset which is to be accepted
 * into the system.
 * @returns tuple containing the original and the duplicate datasets
 */
async function validate_state_before_overwrite({ prisma_transaction_instance, duplicate_dataset_id }) {
  const {
    original_dataset,
    duplicate_dataset,
  } = await validate_duplication_state({ prisma_transaction_instance, duplicate_dataset_id });

  // throw error if this dataset is not ready for acceptance or rejection yet,
  // or if it is not already undergoing acceptance.
  const latest_state = duplicate_dataset.states[0].state;
  if (latest_state !== config.DATASET_STATES.DUPLICATE_READY) {
    // eslint-disable-next-line no-useless-concat
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be in state `
      + `${config.DATASET_STATES.DUPLICATE_READY}, but current state is `
      + `${latest_state}.`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

/**
 * Returns the highest version for datasets that match a given criteria.
 * @param dataset_name
 * @param dataset_type
 * @param is_deleted
 * @param is_duplicate
 * @param prisma_transaction_instance
 * @returns {Number}
 */
async function get_dataset_latest_version({
  prisma_transaction_instance, dataset_name, dataset_type, is_deleted, is_duplicate,
}) {
  const matching_datasets = await prisma_transaction_instance.dataset.findMany({
    where: {
      name: dataset_name,
      type: dataset_type,
      is_deleted,
      is_duplicate,
    },
    orderBy: {
      version: 'desc',
    },
  });
  return matching_datasets.length > 0
    ? matching_datasets[0].version
    : 0;
}

const create_audit_log = async ({
  prisma_transaction_instance, dataset_id, user_id, action,
}) => {
  const created_audit_log = await prisma_transaction_instance.dataset_audit.create({
    data: {
      action,
      user: {
        connect: {
          id: user_id,
        },
      },
      dataset: {
        connect: {
          id: dataset_id,
        },
      },
    },
  });
  return created_audit_log;
};

const create_state_log = async ({
  prisma_transaction_instance, dataset_id, state,
}) => {
  const created_state_log = await prisma_transaction_instance.dataset_state.create({
    data: {
      state,
      dataset: {
        connect: {
          id: dataset_id,
        },
      },
    },
  });

  return {
    created_state_log,
  };
};

/**
 *
 * @param prisma_transaction_instance Prisma transaction instance
 * @param action_item_id ID of the action item to be updated
 * @param action_item_status New status of the action item
 * @param notification_status Optional. New status of the notification associated with the action item
 * @returns {Promise<{updated_action_item: T}>}
 */
const update_notification_and_action_item = async ({
  prisma_transaction_instance, action_item_status, action_item_id,
  notification_status,
}) => {
  const action_item = await prisma_transaction_instance.dataset_action_item.update({
    where: {
      id: action_item_id,
    },
    data: {
      status: action_item_status,
      ...(notification_status && {
        notification: {
          update: {
            status: notification_status,
          },
        },
      }),
    },
  });
  return { updated_action_item: action_item };
};

// TODO - change arg names?
const check_for_pending_workflows = async ({ dataset_id, statuses = [] }) => {
  const retrievedWorkflows = await datasetService.get_workflows({
    dataset_id,
    statuses,
  });

  if (retrievedWorkflows.length > 0) {
    throw new Error(`Dataset ${dataset_id} cannot be overwritten because it has pending workflows.`);
  }
};

/**
 * This function transfers all relations from the original dataset to the dataset that duplicated it.
 * @param prisma_transaction_instance
 * @param original_dataset
 * @param duplicate_dataset
 * @returns {Promise<void>}
 */
const transfer_dataset_associations = async ({
  prisma_transaction_instance,
  original_dataset,
  duplicate_dataset,
}) => {
  // transfer dataset hierarchy relations
  await prisma_transaction_instance.dataset_hierarchy.updateMany({
    where: {
      source_id: original_dataset.id,
    },
    data: {
      source_id: duplicate_dataset.id,
    },
  });
  await prisma_transaction_instance.dataset_hierarchy.updateMany({
    where: {
      derived_id: original_dataset.id,
    },
    data: {
      derived_id: duplicate_dataset.id,
    },
  });
  // Update data access logs.
  await prisma_transaction_instance.data_access_log.updateMany({
    where: {
      dataset_id: original_dataset.id,
    },
    data: {
      dataset_id: duplicate_dataset.id,
    },
  });
  // Update stage request logs.
  await prisma_transaction_instance.stage_request_log.updateMany({
    where: {
      dataset_id: original_dataset.id,
    },
    data: {
      dataset_id: duplicate_dataset.id,
    },
  });

  // Update project-dataset relations
  const original_dataset_project_associations = await prisma_transaction_instance.project_dataset.findMany({
    where: {
      dataset_id: original_dataset.id,
    },
  });

  // eslint-disable-next-line no-restricted-syntax
  for (const association of original_dataset_project_associations) {
    const associated_project_id = association.project_id;
    // eslint-disable-next-line no-await-in-loop
    await prisma_transaction_instance.project_dataset.delete({
      where: {
        project_id_dataset_id: {
          dataset_id: original_dataset.id,
          project_id: associated_project_id,
        },
      },
    });
    // eslint-disable-next-line no-await-in-loop
    await prisma_transaction_instance.project_dataset.create({
      data: {
        dataset_id: duplicate_dataset.id,
        project_id: associated_project_id,
      },
    });
  }
};

const reject_concurrent_active_duplicates = async ({
  prisma_transaction_instance,
  duplicate_dataset,
  accepted_by_id,
}) => {
  // Check if other duplicates having this name and type are active in the
  // system. These will be rejected.
  const other_duplicates = await prisma_transaction_instance.dataset.findMany({
    where: {
      name: duplicate_dataset.name,
      type: duplicate_dataset.type,
      is_deleted: false,
      is_duplicate: true,
      NOT: { id: duplicate_dataset.id },
    },
  });

  const latest_rejected_duplicate_version = await get_dataset_latest_version({
    prisma_transaction_instance,
    dataset_name: duplicate_dataset.name,
    dataset_type: duplicate_dataset.type,
    is_deleted: true,
    is_duplicate: true,
  });

  let i = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const d of other_duplicates) {
    i += 1;
    // eslint-disable-next-line no-await-in-loop
    await create_audit_log({
      prisma_transaction_instance,
      dataset_id: d.id,
      user_id: accepted_by_id,
      action: 'duplicate_rejected',
    });

    // eslint-disable-next-line no-await-in-loop
    await create_state_log({
      prisma_transaction_instance,
      dataset_id: d.id,
      state: 'DUPLICATE_REJECTED',
    });

    // eslint-disable-next-line no-await-in-loop
    const current_duplicate = await prisma_transaction_instance.dataset.findUnique({
      where: {
        id: d.id,
      },
      include: {
        ...CONSTANTS.INCLUDE_STATES,
        ...CONSTANTS.INCLUDE_DUPLICATIONS,
      },
    });
    const duplicate_latest_state = current_duplicate.states[0].state;

    // eslint-disable-next-line no-await-in-loop
    await prisma_transaction_instance.dataset.update({
      where: {
        id: d.id,
      },
      data: {
        is_deleted: true,
        version: duplicate_latest_state === config.DATASET_STATES.DUPLICATE_READY
          ? latest_rejected_duplicate_version + i
          : undefined,
      },
    });

    const current_duplicate_dataset_action_item = (current_duplicate.duplicated_from.duplicate_dataset
      .action_items || [])
      .filter((item) => item.type
        === config.ACTION_ITEM_TYPES.DUPLICATE_DATASET_INGESTION && item.status === 'CREATED')[0];
    // eslint-disable-next-line no-await-in-loop
    await update_notification_and_action_item({
      prisma_transaction_instance,
      action_item_id: current_duplicate_dataset_action_item.id,
      action_item_status: 'RESOLVED',
      notification_status: 'RESOLVED',
    });
  }

  const dataset_being_accepted = await prisma_transaction_instance.dataset.findUnique({
    where: {
      id: duplicate_dataset.id,
    },
    include: {
      ...CONSTANTS.INCLUDE_DATASET_DUPLICATION_DETAILS,
      ...CONSTANTS.INCLUDE_STATES,
      ...CONSTANTS.INCLUDE_WORKFLOWS,
    },
  });
  return dataset_being_accepted;
};

/**
 * Overwrites a dataset by its incoming duplicate.
 *
 * Acknowledges the notification and action items associated with the
 * duplication, and rejects any other concurrent duplicates of the original
 * dataset.
 *
 * @param {Number} duplicate_dataset_id - The duplicate dataset to be accepted.
 * @param {Number} accepted_by_id - id of the user who is accepting the duplicate dataset.
 * @returns the dataset that has now overwritten the original dataset.
 */
async function accept_duplicate_dataset({ duplicate_dataset_id, accepted_by_id }) {
  let duplicate_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: {
      ...CONSTANTS.INCLUDE_DUPLICATIONS,
    },
  });
  const original_dataset_id = duplicate_dataset.duplicated_from.original_dataset.id;

  // check if there are any in-progress workflows for the original and the
  // duplicate datasets
  await check_for_pending_workflows({
    dataset_id: original_dataset_id,
    statuses: ['PENDING', 'STARTED', 'FAILURE', 'RETRY'],
  });
  await check_for_pending_workflows({
    dataset_id: duplicate_dataset_id,
    statuses: ['PENDING', 'STARTED', 'FAILURE', 'RETRY'],
  });

  const accepted_duplicate_dataset = await prisma.$transaction(async (tx) => {
    const state_validation_results = await validate_state_before_overwrite({
      prisma_transaction_instance: tx,
      duplicate_dataset_id,
    });
    const { original_dataset } = state_validation_results;
    duplicate_dataset = state_validation_results.duplicate_dataset;

    await tx.dataset.update({
      where: {
        id: duplicate_dataset.id,
      },
      data: {
        is_duplicate: false,
        // if incoming duplicate's version is not already updated, update it
        version:
          !original_dataset.is_deleted
            ? original_dataset.version + 1
            : undefined,
      },
      include: { ...CONSTANTS.INCLUDE_DUPLICATIONS, ...CONSTANTS.INCLUDE_STATES, ...CONSTANTS.INCLUDE_WORKFLOWS },
    });

    const duplicate_dataset_action_item = (duplicate_dataset.duplicated_from.duplicate_dataset.action_items || [])
      .filter((item) => item.type
        === config.ACTION_ITEM_TYPES.DUPLICATE_DATASET_INGESTION && item.status === 'CREATED')[0];
    await update_notification_and_action_item({
      prisma_transaction_instance: tx,
      action_item_id: duplicate_dataset_action_item.id,
      action_item_status: 'RESOLVED',
      notification_status: 'RESOLVED',
    });
    await create_audit_log({
      prisma_transaction_instance: tx,
      dataset_id: duplicate_dataset.id,
      user_id: accepted_by_id,
      action: 'duplicate_accepted',
    });

    await tx.dataset.update({
      where: {
        id: original_dataset.id,
      },
      data: {
        is_deleted: true,
      },
    });

    await create_audit_log({
      prisma_transaction_instance: tx,
      dataset_id: original_dataset.id,
      user_id: accepted_by_id,
      action: 'overwritten',
    });
    await create_state_log({
      prisma_transaction_instance: tx,
      dataset_id: original_dataset.id,
      state: config.DATASET_STATES.OVERWRITTEN,
    });

    await reject_concurrent_active_duplicates({ prisma_transaction_instance: tx, duplicate_dataset, accepted_by_id });
    await transfer_dataset_associations({ prisma_transaction_instance: tx, original_dataset, duplicate_dataset });

    const duplicate_dataset_being_accepted = await tx.dataset.findUnique({
      where: {
        id: duplicate_dataset.id,
      },
      include: {
        ...CONSTANTS.INCLUDE_DUPLICATIONS,
        ...CONSTANTS.INCLUDE_STATES,
        ...CONSTANTS.INCLUDE_WORKFLOWS,
      },
    });
    return duplicate_dataset_being_accepted;
  });

  return accepted_duplicate_dataset;
}

/**
 * Rejects an incoming duplicate dataset.
 *
 * Acknowledges the
 * action item and the notification associated with this duplication.
 *
 * @param {Number} duplicate_dataset_id The duplicate dataset to be rejected.
 * @param {Number} rejected_by_id id of the user who is rejecting the duplicate dataset.
 *
 * @returns the dataset that has now been rejected.
 */
async function reject_duplicate_dataset({ duplicate_dataset_id, rejected_by_id }) {
  const rejected_dataset = await prisma.$transaction(async (tx) => {
    const { duplicate_dataset } = await validate_duplication_state(
      { prisma_transaction_instance: tx, duplicate_dataset_id },
    );

    const duplicate_dataset_action_item = (duplicate_dataset.duplicated_from.duplicate_dataset.action_items || [])
      .filter((item) => item.type
        === config.ACTION_ITEM_TYPES.DUPLICATE_DATASET_INGESTION && item.status === 'CREATED')[0];
    await update_notification_and_action_item({
      prisma_transaction_instance: tx,
      action_item_id: duplicate_dataset_action_item.id,
      action_item_status: 'RESOLVED',
      notification_status: 'RESOLVED',
    });
    await create_audit_log({
      prisma_transaction_instance: tx,
      dataset_id: duplicate_dataset.id,
      user_id: rejected_by_id,
      action: 'duplicate_rejected',
    });
    await create_state_log({
      prisma_transaction_instance: tx,
      dataset_id: duplicate_dataset.id,
      state: config.DATASET_STATES.DUPLICATE_REJECTED,
    });

    const latest_rejected_duplicate_version = await get_dataset_latest_version({
      prisma_transaction_instance: tx,
      dataset_name: duplicate_dataset.name,
      dataset_type: duplicate_dataset.type,
      is_deleted: true,
      is_duplicate: true,
    });

    const dataset_being_rejected = await tx.dataset.update({
      where: {
        id: duplicate_dataset_id,
      },
      data: {
        is_deleted: true,
        version:
          (!duplicate_dataset.is_deleted)
            ? latest_rejected_duplicate_version + 1
            : undefined,
      },
      include: {
        ...CONSTANTS.INCLUDE_DUPLICATIONS,
        ...CONSTANTS.INCLUDE_STATES,
        ...CONSTANTS.INCLUDE_WORKFLOWS,
      },
    });
    return dataset_being_rejected;
  });

  return rejected_dataset;
}

module.exports = {
  accept_duplicate_dataset,
  reject_duplicate_dataset,
};
