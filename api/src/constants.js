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

const INCLUDE_DATASET_UPLOADS = {
  files: {
    select: {
      id: true,
      md5: true,
      name: true,
      path: true,
    },
  },
  dataset_create_log: {
    include: {
      creator: true,
      dataset: {
        include: {
          source_datasets: {
            include: {
              source_dataset: true,
            },
          },
        },
      },
    },
  },
};

const DATASET_CREATE_METHODS = {
  UPLOAD: 'UPLOAD',
  IMPORT: 'IMPORT',
  SCAN: 'SCAN',
};

const DATASET_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
};

const DONE_STATUSES = ['REVOKED', 'FAILURE', 'SUCCESS'];

const UPLOAD_STATUSES = {
  UPLOADING: 'UPLOADING',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  COMPLETE: 'COMPLETE',
};

const WORKFLOWS = {
  INTEGRATED: 'integrated',
  STAGE: 'stage',
  PROCESS_DATASET_UPLOAD: 'process_dataset_upload',
  CANCEL_DATASET_UPLOAD: 'cancel_dataset_upload',
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

module.exports = {
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  INCLUDE_AUDIT_LOGS,
  INCLUDE_DATASET_UPLOADS,
  auth,
  DONE_STATUSES,
  DATASET_CREATE_METHODS,
  DATASET_ACTIONS,
  UPLOAD_STATUSES,
  WORKFLOWS,
};
