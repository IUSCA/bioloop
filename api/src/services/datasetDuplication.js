const { PrismaClient } = require('@prisma/client');
const CONSTANTS = require('../constants');

// const prisma = new PrismaClient();
const prisma = new PrismaClient(
  // { log: ['query', 'info', 'warn', 'error'] },
  {
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
      {
        emit: 'event',
        level: 'error',
      },
    ],
  },
);

['query', 'info', 'warn', 'error'].forEach((level) => {
  prisma.$on(level, async (e) => {
    console.log(`QUERY: ${e.query}`);
    console.log(`PARAMS: ${e.params}`);
  });
});

/**
 * Returns the highest version for datasets that match a given criteria.
 * @param dataset_name
 * @param dataset_type
 * @param is_deleted
 * @param is_duplicate
 * @returns {Promise<number|number>}
 */
async function get_dataset_latest_version({
  dataset_name, dataset_type, is_deleted, is_duplicate,
}) {
  const matching_datasets = await prisma.dataset.findMany({
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

async function validate_duplication_state(duplicate_dataset_id) {
  const duplicate_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: {
      duplicated_from: true,
      action_items: true,
      states: {
        orderBy: {
          timestamp: 'desc',
        },
      },
      ...CONSTANTS.INCLUDE_WORKFLOWS,
    },
  });

  if (!duplicate_dataset.is_duplicate) {
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be a duplicate, but it is not.`);
  }

  const matching_original_datasets = await prisma.dataset.findMany({
    where: {
      name: duplicate_dataset.name,
      type: duplicate_dataset.type,
      is_deleted: false,
      is_duplicate: false,
    },
  });

  console.log('matchingDatsets:');
  console.dir(matching_original_datasets, { depth: null });

  // Do a sanity check to ensure that there is exactly one matching original
  // dataset of this type before replacing it with the incoming duplicate
  // dataset. If not, the system is in an invalid state and should not
  // proceed.
  if (matching_original_datasets.length !== 1) {
    throw new Error(`Expected to find one active (not deleted) original ${duplicate_dataset.type} named ${duplicate_dataset.name}, but found ${matching_original_datasets.length}.`);
  }

  // Ensure that the matching original dataset's id is the same as the
  // `original_dataset_id` to linked to the duplicate dataset. If not, the
  // system is in an invalid state and should not proceed.
  if (duplicate_dataset.duplicated_from.original_dataset_id !== matching_original_datasets[0].id) {
    throw new Error(`Expected original dataset to have id
       ${duplicate_dataset.duplicated_from.original_dataset_id}, but matching original
        dataset has id ${matching_original_datasets[0].id}.`);
  }

  const original_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset.duplicated_from.original_dataset_id,
    },
  });

  console.log('validate_duplication_state: duplicate_dataset:');
  console.dir(duplicate_dataset, { depth: null });

  return { original_dataset, duplicate_dataset };
}

/**
 * Can be used to perform sanity checks regarding the states of the duplicate
 * dataset and the dataset that it was duplicated from,
 * before accepting or rejecting the duplicate dataset.
 *
 * Returns an object containing the original and the duplicate datasets, if they
 * are in their expected states. Throws errors otherwise.
 * @param {Number} duplicate_dataset_id The duplicate dataset which is to be accepted
 * into the system.
 * @returns Object
 */
async function validate_state_pre_overwrite_resource_purge(duplicate_dataset_id) {
  const {
    original_dataset,
    duplicate_dataset,
  } = await validate_duplication_state(duplicate_dataset_id);

  console.log('duplicate_dataset:');
  console.dir(duplicate_dataset, { depth: null });

  console.log('original_dataset:');
  console.dir(original_dataset, { depth: null });

  // throw error if this dataset is not ready for acceptance or rejection yet,
  // or if it is not already undergoing acceptance.
  const latest_state = duplicate_dataset.states[0].state;
  if (latest_state !== 'DUPLICATE_READY'
      && latest_state !== 'DUPLICATE_ACCEPTANCE_IN_PROGRESS') {
    // eslint-disable-next-line no-useless-concat
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_READY or DUPLICATE_ACCEPTANCE_IN_PROGRESS, but current state is '
        + `${latest_state}.`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

async function validate_state_post_overwrite_resource_purge(duplicate_dataset_id) {
  const duplicate_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: {
      duplicated_from: true,
      states: {
        orderBy: {
          timestamp: 'desc',
        },
      },
      action_items: true,
      ...CONSTANTS.INCLUDE_WORKFLOWS,
    },
  });

  const duplicate_dataset_latest_state = duplicate_dataset.states[0].state;

  if (duplicate_dataset_latest_state !== 'DUPLICATE_ACCEPTANCE_IN_PROGRESS' && duplicate_dataset_latest_state !== 'DUPLICATE_ACCEPTED') {
    throw new Error(`Expected duplicate dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_ACCEPTANCE_IN_PROGRESS or DUPLICATE_ACCEPTED, but current state '
        + `is ${duplicate_dataset_latest_state}.`);
  }

  const original_dataset = await prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset.duplicated_from.original_dataset_id,
    },
    include: {
      states: {
        orderBy: {
          timestamp: 'desc',
        },
      },
    },
  });

  const original_dataset_latest_state = original_dataset.states[0].state;
  if (original_dataset_latest_state !== 'ORIGINAL_DATASET_RESOURCES_PURGED' && original_dataset_latest_state !== 'OVERWRITTEN') {
    throw new Error(`Expected original dataset ${original_dataset.id} to be in one of states `
        + `ORIGINAL_DATASET_RESOURCES_PURGED or OVERWRITTEN, but current state is ${original_dataset_latest_state}`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

async function validate_state_pre_rejection_resource_purge(duplicate_dataset_id) {
  const {
    duplicate_dataset,
    original_dataset,
  } = await validate_duplication_state(duplicate_dataset_id);

  // throw error if this dataset is not ready for acceptance or rejection yet,
  // or if it is not already undergoing accetance.
  // (i.e. the duplicate comparison process is still running)
  const latest_state = duplicate_dataset.states[0].state;
  if (latest_state !== 'DUPLICATE_READY'
      && latest_state !== 'DUPLICATE_REJECTION_IN_PROGRESS') {
    // eslint-disable-next-line no-useless-concat
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_READY or DUPLICATE_REJECTION_IN_PROGRESS, but current state is '
        + `${latest_state}.`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

async function validate_state_post_rejection_resource_purge(duplicate_dataset_id) {
  const {
    duplicate_dataset,
    original_dataset,
  } = await validate_duplication_state(duplicate_dataset_id);

  // throw error if this dataset is not ready for acceptance or rejection yet,
  // or if it is not already undergoing accetance.
  // (i.e. the duplicate comparison process is still running)
  const latest_state = duplicate_dataset.states[0].state;
  if (latest_state !== 'DUPLICATE_DATASET_RESOURCES_PURGED'
      && latest_state !== 'DUPLICATE_REJECTION_IN_PROGRESS') {
    // eslint-disable-next-line no-useless-concat
    throw new Error(`Expected dataset ${duplicate_dataset.id} to be in one of states `
        + 'DUPLICATE_DATASET_RESOURCES_PURGED or DUPLICATE_REJECTION_IN_PROGRESS, but current state is '
        + `${latest_state}.`);
  }

  return {
    original_dataset,
    duplicate_dataset,
  };
}

const audit_and_update_state_queries = async ({
  dataset_id, user_id, action, state,
}) => {
  const update_queries = [];

  if (action) {
    // if an audit log hasn't been created for the acceptance of the incoming
    // duplicate, create one.
    const audit_logs = await prisma.dataset_audit.findMany({
      where: {
        action,
        user_id,
        dataset_id,
      },
    });
    if (audit_logs.length < 1) {
      update_queries.push(prisma.dataset_audit.create({
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
      }));
    }
  }

  if (state) {
    // if a state update record hasn't been created for the acceptance of the
    // incoming duplicate, create one.
    const state_logs = await prisma.dataset_state.findMany({
      where: {
        state,
        dataset_id,
      },
    });
    if (state_logs.length < 1) {
      update_queries.push(prisma.dataset_state.create({
        data: {
          state,
          dataset: {
            connect: {
              id: dataset_id,
            },
          },
        },
      }));
    }
  }
  return update_queries;
};

const update_action_item_queries = async ({
  dataset, status, active, notification_status, notification_active,
}) => {
  const update_queries = [];

  const action_item = (dataset.action_items || [])
    .filter((item) => item.type === 'DUPLICATE_DATASET_INGESTION' && item.active)[0];
  if (action_item) {
    update_queries.push(prisma.dataset_action_item.update({
      where: {
        id: action_item.id,
      },
      data: {
        status,
        active: typeof active === 'boolean' ? active : undefined,
        notification: {
          update: {
            status: notification_status,
            active: typeof notification_active === 'boolean'
              ? notification_active : undefined,
          },
        },
      },
    }));
  }

  return update_queries;
};

/**
 * Initiates the replacement of a dataset by its incoming duplicate,
 * by performing the database write operations needed to overwrite an existing
 * dataset with its duplicate.
 *
 * The following write operations are performed:
 *
 * Returns the dataset that was previously a duplicate and has now replaced
 * the dataset that it was duplicated from. Upon successful execution,
 * both datasets are left in a state of DUPLICATE_ACCEPTANCE_IN_PROGRESS,
 * and their action items are locked. This is done because these the process of
 * overwriting a dataset with a duplicate also involves cleaning filesystem
 * resources, which is an async process. Once the resources have been cleaned
 * up, another API call updates the state of the dataset and their
 * corresponding action items. This is the point when the replacement of the
 * original dataset with its incoming duplicate is considered complete.
 *
 * This method is expected to be idempotent (the resultant end state
 * should be the same every time this method is called).
 *
 * @param {Number} duplicate_dataset_id - The duplicate dataset to be accepted.
 * @param {Number} accepted_by_id - id of the user who is accepting the duplicate dataset.
 */
async function initiate_duplicate_acceptance({ duplicate_dataset_id, accepted_by_id }) {
  const {
    original_dataset,
    duplicate_dataset,
  } = await
  validate_state_pre_overwrite_resource_purge(duplicate_dataset_id);

  // write queries to be run in a single transaction, before a workflow is
  // launched to handle the acceptance/rejection on the worker-end.
  let update_queries = [];

  update_queries.push(prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: { ...CONSTANTS.DUPLICATION_PROCESSING_INCLUSIONS, ...CONSTANTS.INCLUDE_WORKFLOWS },
  }));

  update_queries = update_queries.concat(await update_action_item_queries({
    dataset: duplicate_dataset,
    status: 'ACKNOWLEDGED',
    notification_status: 'ACKNOWLEDGED',
  }));

  update_queries = update_queries.concat(await audit_and_update_state_queries({
    dataset_id: duplicate_dataset.id,
    user_id: accepted_by_id,
    action: 'duplicate_acceptance_initiated',
    state: 'DUPLICATE_ACCEPTANCE_IN_PROGRESS',
  }));

  update_queries = update_queries.concat(await audit_and_update_state_queries({
    dataset_id: original_dataset.id,
    user_id: accepted_by_id,
    action: 'overwrite_initiated',
    state: 'OVERWRITE_IN_PROGRESS',
  }));

  const latest_rejected_duplicate_version = await get_dataset_latest_version({
    dataset_name: duplicate_dataset.name,
    dataset_type: duplicate_dataset.type,
    is_deleted: true,
    is_duplicate: true,
  });

  // Check if other duplicates having this name and type are active in the
  // system. These will be rejected.
  const other_duplicates = await prisma.dataset.findMany({
    where: {
      name: duplicate_dataset.name,
      type: duplicate_dataset.type,
      is_deleted: false,
      is_duplicate: true,
      NOT: { id: duplicate_dataset_id },
    },
  });
  // For the duplicates that are about to be rejected:
  // 1. lock the action items associated with them.
  // 2. create audit logs to indicate that these datasets were
  // rejected.
  let i = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const d of other_duplicates) {
    i += 1;
    // eslint-disable-next-line no-await-in-loop
    update_queries = update_queries.concat(await audit_and_update_state_queries({
      dataset_id: d.id,
      user_id: accepted_by_id,
      action: 'duplicate_rejected',
      state: 'DUPLICATE_REJECTED',
    }));

    // eslint-disable-next-line no-await-in-loop
    const current_duplicate = await prisma.dataset.findUnique({
      where: {
        id: d.id,
      },
      include: {
        states: {
          orderBy: {
            timestamp: 'desc',
          },
        },
        action_items: true,
      },
    });
    const duplicate_latest_state = current_duplicate.states[0].state;

    update_queries.push(prisma.dataset.update({
      where: {
        id: d.id,
      },
      data: {
        is_deleted: true,
        version: duplicate_latest_state === 'DUPLICATE_READY'
          ? latest_rejected_duplicate_version + i
          : undefined,
      },
    }));

    // eslint-disable-next-line no-await-in-loop
    update_queries = update_queries.concat(await update_action_item_queries({
      dataset: current_duplicate,
      status: 'RESOLVED',
      active: false,
      notification_status: 'RESOLVED',
      notification_active: false,
    }));
  }

  // At this point, both the original and the incoming duplicate datasets are
  // considered "locked", and write operations on either of them should be
  // forbidden, until the lock is removed by another process.

  console.log('made it to the end before transaction');

  console.dir(update_queries, { depth: null });

  const [dataset_being_accepted] = await prisma.$transaction(update_queries);

  console.log('made it to the end after transaction');

  return dataset_being_accepted;
}

async function complete_duplicate_acceptance({ duplicate_dataset_id }) {
  const {
    original_dataset,
    duplicate_dataset,
  } = await validate_state_post_overwrite_resource_purge(duplicate_dataset_id);

  // assumes states are sorted descending by timestamp
  const original_dataset_state = original_dataset.states[0].state;

  let update_queries = [];

  update_queries.push(prisma.dataset.update({
    where: {
      id: duplicate_dataset.id,
    },
    data: {
      is_duplicate: false,
      // if incoming duplicate's version is not already updated, update it
      version: (!original_dataset.is_deleted && original_dataset_state === 'ORIGINAL_DATASET_RESOURCES_PURGED')
        ? original_dataset.version + 1
        : undefined,
      audit_logs: {
        // Update the audit log.
        updateMany: {
          where: {
            action: 'duplicate_acceptance_initiated',
          },
          data: {
            action: 'duplicate_accepted',
          },
        },
      },
    },
    include: { ...CONSTANTS.DUPLICATION_PROCESSING_INCLUSIONS, ...CONSTANTS.INCLUDE_WORKFLOWS },
  }));

  update_queries = update_queries.concat(await update_action_item_queries({
    dataset: duplicate_dataset,
    status: 'RESOLVED',
    active: false,
    notification_status: 'RESOLVED',
    notification_active: false,
  }));

  update_queries = update_queries.concat(await audit_and_update_state_queries({
    dataset_id: duplicate_dataset_id,
    state: 'DUPLICATE_ACCEPTED',
  }));

  update_queries.push(prisma.dataset.update({
    where: {
      id: original_dataset.id,
    },
    data: {
      is_deleted: true,
      audit_logs: {
        updateMany: {
          where: {
            action: 'overwrite_initiated',
          },
          data: {
            action: 'overwritten',
          },
        },
      },
    },
  }));

  // if a state update record hasn't been created for the overwrite of the
  // original dataset, create one.
  update_queries = update_queries.concat(await audit_and_update_state_queries({
    dataset_id: original_dataset.id,
    state: 'OVERWRITTEN',
  }));

  // transfer dataset hierarchies from original to incoming duplicate dataset
  update_queries.push(prisma.dataset_hierarchy.updateMany({
    where: {
      source_id: original_dataset.id,
    },
    data: {
      source_id: duplicate_dataset.id,
    },
  }));
  update_queries.push(prisma.dataset_hierarchy.updateMany({
    where: {
      derived_id: original_dataset.id,
    },
    data: {
      derived_id: duplicate_dataset.id,
    },
  }));

  // Operators will likely be more interested in seeing the access statistics
  // for this dataset across all of its duplicates. Therefore, any previous
  // access attempts associated with the original dataset's id can be
  // overwritten with the incoming duplicate dataset's id.
  update_queries.push(
    prisma.data_access_log.updateMany({
      where: {
        dataset_id: original_dataset.id,
      },
      data: {
        dataset_id: duplicate_dataset.id,
      },
    }),
  );
  update_queries.push(
    prisma.stage_request_log.updateMany({
      where: {
        dataset_id: original_dataset.id,
      },
      data: {
        dataset_id: duplicate_dataset.id,
      },
    }),
  );

  const [accepted_dataset] = await prisma.$transaction(update_queries);

  // if (true) {
  //   throw new Error('test error');
  // }

  return accepted_dataset;
}

/**
 * Performs the database write operations needed to reject an incoming
 * duplicate dataset.
 *
 * This method is expected to be idempotent (the resultant end state
 * should be the same every time this method is called).
 *
 * @param {Number} duplicate_dataset_id - The duplicate dataset to be rejected.
 * @param {Number} rejected_by_id - id of the user who is rejecting the duplicate dataset.
 */
async function initiate_duplicate_rejection({ duplicate_dataset_id, rejected_by_id }) {
  const { duplicate_dataset } = await validate_state_pre_rejection_resource_purge(
    duplicate_dataset_id,
  );

  let update_queries = [];

  update_queries.push(prisma.dataset.findUnique({
    where: {
      id: duplicate_dataset_id,
    },
    include: { ...CONSTANTS.DUPLICATION_PROCESSING_INCLUSIONS, ...CONSTANTS.INCLUDE_WORKFLOWS },
  }));

  console.log('initiated rejection');

  update_queries = update_queries.concat(await update_action_item_queries({
    dataset: duplicate_dataset,
    status: 'ACKNOWLEDGED',
    notification_status: 'ACKNOWLEDGED',
  }));

  update_queries = update_queries.concat(await audit_and_update_state_queries({
    dataset_id: duplicate_dataset.id,
    user_id: rejected_by_id,
    action: 'duplicate_rejected',
    state: 'DUPLICATE_REJECTION_IN_PROGRESS',
  }));

  const [dataset_being_rejected] = await prisma.$transaction(update_queries);

  console.log('dataset_being_rejected');
  console.dir(dataset_being_rejected, { depth: null });

  return dataset_being_rejected;
}

async function complete_duplicate_rejection({ duplicate_dataset_id }) {
  const { duplicate_dataset } = await validate_state_post_rejection_resource_purge(
    duplicate_dataset_id,
  );

  // assumes states are sorted descending by timestamp
  const duplicate_dataset_latest_state = duplicate_dataset.states[0].state;

  const latest_rejected_duplicate_version = await get_dataset_latest_version({
    dataset_name: duplicate_dataset.name,
    dataset_type: duplicate_dataset.type,
    is_deleted: true,
    is_duplicate: true,
  });

  let update_queries = [];

  update_queries.push(prisma.dataset.update({
    where: {
      id: duplicate_dataset_id,
    },
    data: {
      is_deleted: true,
      version: (!duplicate_dataset.is_deleted && duplicate_dataset_latest_state === 'DUPLICATE_DATASET_RESOURCES_PURGED')
        ? latest_rejected_duplicate_version + 1
        : undefined,
    },
    include: { ...CONSTANTS.DUPLICATION_PROCESSING_INCLUSIONS, ...CONSTANTS.INCLUDE_WORKFLOWS },
  }));

  update_queries = update_queries.concat(await update_action_item_queries({
    dataset: duplicate_dataset,
    status: 'RESOLVED',
    active: false,
    notification_status: 'RESOLVED',
    notification_active: false,
  }));

  update_queries = update_queries.concat(await audit_and_update_state_queries({
    dataset_id: duplicate_dataset.id,
    state: 'DUPLICATE_REJECTED',
  }));

  const [rejected_dataset] = await prisma.$transaction(update_queries);
  return rejected_dataset;
}

module.exports = {
  initiate_duplicate_acceptance,
  complete_duplicate_acceptance,
  initiate_duplicate_rejection,
  complete_duplicate_rejection,
};
