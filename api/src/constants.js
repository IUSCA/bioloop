const INCLUDE_DUPLICATIONS = {
  duplicated_from: {
    include: {
      duplicate_dataset: {
        include: {
          action_items: true,
        },
      },
      original_dataset: true,
    },
  },
  duplicated_by: {
    include: {
      duplicate_dataset: {
        include: {
          action_items: true,
        },
      },
      original_dataset: true,
    },
  },
};

const DUPLICATION_PROCESSING_INCLUSIONS = {
  duplicated_from: {
    include: {
      original_dataset: true,
      duplicate_dataset: true,
    },
  },
  duplicated_by: {
    include: {
      original_dataset: true,
      duplicate_dataset: true,
    },
  },
  states: {
    orderBy: {
      timestamp: 'desc',
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

const INCLUDE_UPLOAD_LOG_RELATIONS = {
  files: true,
  user: true,
  dataset: {
    include: {
      source_datasets: {
        include: {
          source_dataset: true,
        },
      },
      file_type: true,
    },
  },
};

const DONE_STATUSES = ['REVOKED', 'FAILURE', 'SUCCESS'];

module.exports = {
  INCLUDE_FILES,
  INCLUDE_STATES,
  INCLUDE_WORKFLOWS,
  INCLUDE_AUDIT_LOGS,
  INCLUDE_DUPLICATIONS,
  DUPLICATION_PROCESSING_INCLUSIONS,
  DONE_STATUSES,
  INCLUDE_UPLOAD_LOG_RELATIONS,
};