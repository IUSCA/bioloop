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

const DONE_STATUSES = ['REVOKED', 'FAILURE', 'SUCCESS'];

module.exports = {
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  INCLUDE_AUDIT_LOGS,
  DONE_STATUSES,
  INCLUDE_DATASET_UPLOAD_LOG_RELATIONS,
};
