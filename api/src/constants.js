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
  audit_log: {
    select: {
      id: true,
      user: true,
      timestamp: true,
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
    },
  },
  files: {
    select: {
      id: true,
      md5: true,
      name: true,
      path: true,
    },
  },
};

const DATASET_CREATE_METHODS = {
  UPLOAD: 'UPLOAD',
  IMPORT: 'IMPORT',
  SCAN: 'SCAN',
};

const DONE_STATUSES = ['REVOKED', 'FAILURE', 'SUCCESS'];

module.exports = {
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  INCLUDE_AUDIT_LOGS,
  INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
  DONE_STATUSES,
  DATASET_CREATE_METHODS,
};
