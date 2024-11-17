const INCLUDE_DATASET_DUPLICATION_DETAILS = {
  duplicated_from: {
    include: {
      duplicate_dataset: {
        include: {
          notifications: {
            action_items: true,
          },
        },
      },
      original_dataset: true,
    },
  },
  duplicated_by: {
    include: {
      duplicate_dataset: {
        include: {
          notifications: {
            action_items: true,
          },
        },
      },
      original_dataset: true,
    },
  },
};

const INCLUDE_STATES = {
  states: {
    select: {
      state: true,
      timestamp: true,
      metadata: true,
    },
    orderBy: {
      timestamp: 'desc',
    },
  },
};

const INCLUDE_FILES = {
  files: {
    select: {
      path: true,
      md5: true,
      name: true,
    },
    where: {
      NOT: {
        filetype: 'directory',
      },
    },
  },
};

const INCLUDE_WORKFLOWS = {
  workflows: {
    select: {
      id: true,
    },
  },
};

const INCLUDE_AUDIT_LOGS = {
  audit_logs: {
    include: {
      user: {
        include: {
          user_role: {
            select: { roles: true },
          },
        },
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
  },
};

const INCLUDE_DATASET_UPLOAD_LOG_RELATIONS = {
  dataset: {
    select: {
      id: true,
      name: true,
      source_datasets: {
        select: {
          source_dataset: true,
        },
      },
    },
  },
  upload_log: {
    select: {
      id: true,
      user: true,
      status: true,
      initiated_at: true,
      files: {
        select: {
          id: true,
          md5: true,
          name: true,
          path: true,
        },
      },
    },
  },
};

const DATASET_STATES = {
  REGISTERED: 'REGISTERED',
  READY: 'READY',
  INSPECTED: 'INSPECTED',
  ARCHIVED: 'ARCHIVED',
  FETCHED: 'FETCHED',
  STAGED: 'STAGED',
  DUPLICATE_REGISTERED: 'DUPLICATE_REGISTERED',
  DUPLICATE_READY: 'DUPLICATE_READY',
  DUPLICATE_ACCEPTANCE_IN_PROGRESS: 'DUPLICATE_ACCEPTANCE_IN_PROGRESS',
  DUPLICATE_REJECTION_IN_PROGRESS: 'DUPLICATE_REJECTION_IN_PROGRESS',
  DUPLICATE_DATASET_RESOURCES_PURGED: 'DUPLICATE_DATASET_RESOURCES_PURGED',
  DUPLICATE_ACCEPTED: 'DUPLICATE_ACCEPTED',
  DUPLICATE_REJECTED: 'DUPLICATE_REJECTED',
  OVERWRITE_IN_PROGRESS: 'OVERWRITE_IN_PROGRESS',
  ORIGINAL_DATASET_RESOURCES_PURGED: 'ORIGINAL_DATASET_RESOURCES_PURGED',
  OVERWRITTEN: 'OVERWRITTEN',
  DELETED: 'DELETED',
};

const NOTIFICATION_STATUS = {
  CREATED: 'CREATED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
};

const ACTION_ITEM_STATUS = {
  CREATED: 'CREATED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
};

const NOTIFICATION_TYPES = {
  DUPLICATE_DATASET_REGISTRATION: 'DUPLICATE_DATASET_REGISTRATION',
};

const DONE_STATUSES = ['REVOKED', 'FAILURE', 'SUCCESS'];

// todo - move DATASET_STATES here

module.exports = {
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  INCLUDE_AUDIT_LOGS,
  DONE_STATUSES,
  DATASET_STATES,
  INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
  INCLUDE_DATASET_DUPLICATION_DETAILS,
  NOTIFICATION_STATUS,
  ACTION_ITEM_STATUS,
  NOTIFICATION_TYPES,
};
