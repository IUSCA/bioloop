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

const INCLUDE_UPLOAD_LOG_RELATIONS = {
  dataset: {
    select: {
      id: true,
      source_datasets: {
        select: {
          source_dataset: true,
        },
      },
    },
  },
  user: true,
  files: {
    select: {
      md5: true,
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
  INCLUDE_UPLOAD_LOG_RELATIONS,
};
