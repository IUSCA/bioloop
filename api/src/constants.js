const INCLUDE_DUPLICATIONS = {
  duplicated_from: {
    include: {
      duplicate_dataset: true,
      original_dataset: true,
    },
  },
  duplicated_by: {
    include: {
      duplicate_dataset: true,
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

const INCLUDE_PROJECTS = {
  projects: {
    select: {
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          browser_enabled: true,
          funding: true,
          metadata: true,
          created_at: true,
          updated_at: true,
          owner_id: true,
        },
      },
    },
  },
};

const INCLUDE_DATASET_UPLOAD_LOG_RELATIONS = {
  dataset: {
    select: {
      id: true,
      name: true,
      type: true,
      metadata: true,
      origin_path: true,
      create_method: true,
      created_at: true,
      source_datasets: {
        select: {
          source_dataset: true,
        },
      },
      projects: {
        select: {
          project: true,
        },
      },
      audit_logs: {
        where: {
          action: 'create',
        },
        select: {
          user: true,
          timestamp: true,
        },
        orderBy: {
          timestamp: 'asc',
        },
        take: 1,
      },
    },
  },
};

const DATASET_CREATE_METHODS = {
  UPLOAD: 'UPLOAD',
  IMPORT: 'IMPORT',
  SCAN: 'SCAN',
};

const DONE_STATUSES = ['REVOKED', 'FAILURE', 'SUCCESS'];

const UPLOAD_STATUSES = {
  UPLOADING: 'UPLOADING',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  UPLOADED: 'UPLOADED',
  VERIFYING: 'VERIFYING',
  VERIFIED: 'VERIFIED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  PROCESSING: 'PROCESSING',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  COMPLETE: 'COMPLETE',
  PERMANENTLY_FAILED: 'PERMANENTLY_FAILED',
};

const WORKFLOWS = {
  INTEGRATED: 'integrated',
  STAGE: 'stage',
  PROCESS_DATASET_UPLOAD: 'process_dataset_upload',
  CANCEL_DATASET_UPLOAD: 'cancel_dataset_upload',
};

const DATASET_STATES = {
  READY: 'READY',
  ARCHIVED: 'ARCHIVED',
  REGISTERED: 'REGISTERED',
  FETCHED: 'FETCHED',
  STAGED: 'STAGED',
  DELETED: 'DELETED',
  INSPECTED: 'INSPECTED',
  DUPLICATE_REGISTERED: 'DUPLICATE_REGISTERED',
  DUPLICATE_READY: 'DUPLICATE_READY',
  DUPLICATE_REJECTED: 'DUPLICATE_REJECTED',
  OVERWRITTEN: 'OVERWRITTEN',
};

const DATASET_DUPLICATION_ANALYSIS_STATUSES = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  NOT_DUPLICATE: 'NOT_DUPLICATE',
  FAILED: 'FAILED',
};

const INGESTION_CHECK_TYPES = {
  EXACT_CONTENT_MATCHES: 'EXACT_CONTENT_MATCHES',
  SAME_PATH_SAME_CONTENT: 'SAME_PATH_SAME_CONTENT',
  SAME_PATH_DIFFERENT_CONTENT: 'SAME_PATH_DIFFERENT_CONTENT',
  SAME_CONTENT_DIFFERENT_PATH: 'SAME_CONTENT_DIFFERENT_PATH',
  ONLY_IN_INCOMING: 'ONLY_IN_INCOMING',
  ONLY_IN_ORIGINAL: 'ONLY_IN_ORIGINAL',
};

const auth = {
  verify: {
    response: {
      status: {
        SUCCESS: 'success',
        SIGNUP_REQUIRED: 'signup_required',
        NOT_A_USER: 'not_a_user',
      },
    },
  },
};

const ALERT_STATUSES = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
};

const ALERT_TYPES = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
};

const NOTIFICATION_TYPES = {
  /** Dataset created. */
  DATASET_CREATED: 'DATASET_CREATED',
  /** Duplicate candidate registered; admins/operators review on the duplicate dataset page. */
  INCOMING_DUPLICATE_DATASET: 'INCOMING_DUPLICATE_DATASET',
};

const NOTIFICATIONS_TYPES_ROLE_MAP = {
  [NOTIFICATION_TYPES.DATASET_CREATED]: ['admin', 'operator'],
  [NOTIFICATION_TYPES.INCOMING_DUPLICATE_DATASET]: ['admin', 'operator'],
};

module.exports = {
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  INCLUDE_AUDIT_LOGS,
  INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
  INCLUDE_DUPLICATIONS,
  auth,
  DONE_STATUSES,
  DATASET_CREATE_METHODS,
  UPLOAD_STATUSES,
  WORKFLOWS,
  ALERT_TYPES,
  ALERT_STATUSES,
  DATASET_STATES,
  DATASET_DUPLICATION_ANALYSIS_STATUSES,
  INGESTION_CHECK_TYPES,
  INCLUDE_PROJECTS,
  NOTIFICATION_TYPES,
  NOTIFICATIONS_TYPES_ROLE_MAP,
};
