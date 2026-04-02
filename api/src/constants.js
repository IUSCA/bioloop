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
      upload: {
        select: {
          id: true,
          files: true,
          status: true,
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
  audit_log: {
    select: {
      id: true,
      user: true,
      timestamp: true,
      upload: {
        select: {
          status: true,
        },
      },
      dataset: {
        select: {
          id: true,
          name: true,
          type: true,
          origin_path: true,
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

const EVERYONE_GROUP_ID = '00000000-0000-0000-0000-000000000000';

// need to specify ids to have deterministic seeding
const GRANT_ACCESS_TYPES = [
  {
    id: 1,
    name: 'DATASET:VIEW_METADATA',
    description: 'See dataset exists',
    long_description: 'See dataset exists and view non-sensitive metadata such as description, size, file count',
  },
  {
    id: 2,
    name: 'DATASET:VIEW_SENSITIVE_METADATA',
    description: 'Paths, infrastructure and lifecycle data',
    long_description: 'View sensitive metadata such as file paths, infrastructure details, and lifecycle data',
  },
  {
    id: 3,
    name: 'DATASET:REQUEST_ACCESS',
    description: 'Can request access',
    long_description: 'Can request other access types, which may include '
    + 'viewing sensitive metadata, listing files, downloading, remote access, or compute access',
  },
  {
    id: 4,
    name: 'DATASET:LIST_FILES',
    description: 'Browse file tree',
    long_description: 'Browse file tree and see file names, size.',
  },
  {
    id: 5,
    name: 'DATASET:DOWNLOAD',
    description: 'Local copy',
    long_description: 'Download individual files or entire bundle for local use',
  },
  {
    id: 6,
    name: 'DATASET:COMPUTE',
    description: 'Run compute jobs',
    long_description: 'Run compute jobs on dataset in place, without downloading',
  },
  {
    id: 7,
    name: 'COLLECTION:VIEW_METADATA',
    description: 'See collection exists',
    long_description: 'See collection exists and view non-sensitive metadata such as description, dataset count',
  },
  {
    id: 8,
    name: 'COLLECTION:REQUEST_ACCESS',
    description: 'Can request access',
    long_description: 'Can request other access types, which may include listing datasets in collection',
  },
  {
    id: 9,
    name: 'COLLECTION:LIST_CONTENTS',
    description: 'Browse datasets in collection',
    long_description: 'Browse datasets in collection and see dataset names, types, and size',
  },
  {
    id: 10,
    name: 'DATASET:REMOTE_ACCESS',
    description: 'Path to storage',
    long_description: 'Access dataset in place via provided path, without downloading',
  },
  {
    id: 11,
    name: 'DATASET:LIST_DERIVED_DATASETS',
    description: 'View derived datasets',
    long_description: 'View derived datasets and their metadata that reference this dataset as a source',
  },
];

const GRANT_PRESETS = [
  {
    id: 1,
    name: 'Discoverable',
    description: 'Allows users to view collection and dataset metadata and request further access',
    access_type_ids: [1, 3, 7, 9],
  },
  {
    id: 2,
    name: 'Standard Research Use',
    description: 'Allows users to view and download datasets',
    access_type_ids: [1, 4, 5, 7, 9],
  },
  {
    id: 3,
    name: 'Restricted Research Use',
    description: 'Allows users to run compute jobs, except download',
    access_type_ids: [1, 4, 6, 7, 9],
  },
];

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
  EVERYONE_GROUP_ID,
  GRANT_ACCESS_TYPES,
  GRANT_PRESETS,
};
