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
};

const DATASET_STATES = {
  READY: 'READY',
  ARCHIVED: 'ARCHIVED',
  REGISTERED: 'REGISTERED',
  FETCHED: 'FETCHED',
  STAGED: 'STAGED',
  DELETED: 'DELETED',
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

module.exports = {
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  INCLUDE_AUDIT_LOGS,
  INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
  auth,
  DONE_STATUSES,
  DATASET_CREATE_METHODS,
  UPLOAD_STATUSES,
  WORKFLOWS,
  ALERT_TYPES,
  ALERT_STATUSES,
  DATASET_STATES,
  INCLUDE_PROJECTS,
};
