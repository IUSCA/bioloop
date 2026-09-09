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

// The ten upload statuses collapsed into the three answers a person actually wants from a
// listing: is it still moving, did it stop, or is it done. `GET /v2/datasets` takes a group
// name in `upload_status`; a single status is accepted there as well.
//
// A test asserts these three cover every value of UPLOAD_STATUSES exactly once, so a status
// added to the enum has to be classified before it can ship.
// @see docs/design/groups/dataset-creation-plan.md — C5
const UPLOAD_STATUS_GROUPS = {
  IN_PROGRESS: [
    UPLOAD_STATUSES.UPLOADING,
    UPLOAD_STATUSES.UPLOADED,
    UPLOAD_STATUSES.VERIFYING,
    UPLOAD_STATUSES.VERIFIED,
    UPLOAD_STATUSES.PROCESSING,
  ],
  FAILED: [
    UPLOAD_STATUSES.UPLOAD_FAILED,
    UPLOAD_STATUSES.VERIFICATION_FAILED,
    UPLOAD_STATUSES.PROCESSING_FAILED,
    UPLOAD_STATUSES.PERMANENTLY_FAILED,
  ],
  COMPLETE: [UPLOAD_STATUSES.COMPLETE],
};

// Accepted values of the `upload_status` query parameter: the three group names, ANY for
// "was uploaded at all, whatever came of it", and any single status.
const UPLOAD_STATUS_FILTERS = [
  'ANY',
  ...Object.keys(UPLOAD_STATUS_GROUPS),
  ...Object.values(UPLOAD_STATUSES),
];

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

// ── Seeded rows with fixed ids ───────────────────────────────────────────────
//
// Two rules govern every id in this block.
//
// It must parse as an RFC 4122 UUID, with the version (4) and variant (8) nibbles set.
// Route parameters are checked with express-validator's isUUID(), so a zero-filled
// sentinel is stored happily by Postgres and then rejected by the route that addresses
// the row.
//
// Its leading bytes must not be zero. createDeterministicUuidGenerator() in
// prisma/seed_data counts up from zero in the last eight bytes and sets the same version
// and variant nibbles, so a zero-prefixed sentinel is exactly what the seed emits for its
// first few rows. AUTHENTICATED_USERS_GROUP_ID breaks both rules and keeps its value only
// because changing it would orphan every grant and audit record that names it.

// The two system principals. Both are rows in the `group` table so a grant can name them
// like any other subject, but neither has members or a place in the group hierarchy, and
// neither can be deleted.
//
// PUBLIC is the wider of the two: it means everyone, including people who are not signed
// in, so an authenticated user's subject set contains both.
// @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
const AUTHENTICATED_USERS_GROUP_ID = '00000000-0000-0000-0000-000000000000';
const PUBLIC_GROUP_ID = 'ffffffff-0000-4000-8000-000000000002';
const SYSTEM_PRINCIPAL_GROUP_IDS = [AUTHENTICATED_USERS_GROUP_ID, PUBLIC_GROUP_ID];

// The caller of an unauthenticated request. A subject with no memberships, no grants, and
// no roles, so every membership policy and the platform-admin check evaluate false against
// it without a special case anywhere in the engine.
//
// Its subject_id is the `Public` principal itself. That is what makes the grant subject-set
// builder able to tell an anonymous caller from a signed-in one, and it is why frozen
// matters: nothing may mutate a principal that is shared by every anonymous request.
//
// Every user attribute the group and collection policies declare is present, so the engine
// hydrates none of them and reads no user row.
// @see docs/design/groups/profiles.md — The anonymous principal
const ANONYMOUS_PRINCIPAL = Object.freeze({
  subject_id: PUBLIC_GROUP_ID,
  is_anonymous: true,
  roles: Object.freeze([]),
  group_memberships: Object.freeze([]),
  effective_group_ids: Object.freeze([]),
  oversight_group_ids: Object.freeze([]),
  accessible_owner_group_ids: Object.freeze([]),
});

// The service account every unattended write is credited to: the watch script, the workers,
// and any row the system issues rather than a person. Both ids are pinned so a reseed does
// not invalidate the workers' APP_API_TOKEN, which carries them as claims and is never
// reissued automatically.
// @see .claude/skills/workers-dev/SKILL.md — Environment
const SVC_TASKS_USER_ID = 1;
const SVC_TASKS_SUBJECT_ID = 'ffffffff-0000-4000-8000-000000000003';

// Archived system group holding datasets that have no owning group. Datasets land here
// only through the backfill that made dataset.owner_group_id NOT NULL; nothing writes to
// it at runtime. Its contents are a list for platform admins to work through.
// @see docs/design/groups/decisions.md — 2. Every dataset has an owning group
const UNASSIGNED_DATASETS_GROUP_ID = 'ffffffff-0000-4000-8000-000000000001';

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
  {
    id: 12,
    name: 'DATASET:LIST_SOURCE_DATASETS',
    description: 'View source datasets',
    long_description: 'View source datasets and their metadata that reference this dataset as a derived dataset',
  },
];

// The partial order over access types. Each pair reads "implying implies implied": holding
// the first satisfies any check for the second. Evaluation closes over these transitively,
// so DOWNLOAD satisfies VIEW_METADATA through LIST_FILES without an edge between them.
//
// Seeded into grant_access_type_implication. The engine reads the table, never this list,
// so adding an access type means a migration rather than a code change.
//
// File listing is the read plane: there is no DATASET:READ_DATA, and the dataset
// `read_data` policy action checks DATASET:LIST_FILES on purpose.
// @see docs/design/groups/decisions.md — 7. Access types imply one another
const GRANT_ACCESS_TYPE_IMPLICATIONS = [
  // Any way of using the bytes implies being able to see what the bytes are.
  ['DATASET:DOWNLOAD', 'DATASET:LIST_FILES'],
  ['DATASET:COMPUTE', 'DATASET:LIST_FILES'],
  ['DATASET:REMOTE_ACCESS', 'DATASET:LIST_FILES'],

  // Anything you can do to a dataset implies knowing the dataset exists.
  ['DATASET:LIST_FILES', 'DATASET:VIEW_METADATA'],
  ['DATASET:VIEW_SENSITIVE_METADATA', 'DATASET:VIEW_METADATA'],
  ['DATASET:REQUEST_ACCESS', 'DATASET:VIEW_METADATA'],
  ['DATASET:LIST_DERIVED_DATASETS', 'DATASET:VIEW_METADATA'],
  ['DATASET:LIST_SOURCE_DATASETS', 'DATASET:VIEW_METADATA'],

  // The same shape one level up, for collections.
  ['COLLECTION:LIST_CONTENTS', 'COLLECTION:VIEW_METADATA'],
  ['COLLECTION:REQUEST_ACCESS', 'COLLECTION:VIEW_METADATA'],
];

const GRANT_PRESETS = [
  {
    id: 1,
    name: 'Discoverable',
    description: 'Allows users to view collection and dataset metadata and request further access',
    resource_types: ['COLLECTION'],
    access_type_ids: [1, 3, 7, 9],
  },
  {
    id: 2,
    name: 'Standard Research Use',
    description: 'Allows users to view and download datasets',
    resource_types: ['COLLECTION'],
    access_type_ids: [1, 4, 5, 7, 9],
  },
  // Dataset-only copies of built-in presets (collection actions removed):
  {
    id: 3,
    name: 'Discoverable (Dataset)',
    description: 'Dataset grants only: view metadata and request access',
    resource_types: ['DATASET'],
    access_type_ids: [1, 3],
  },
  {
    id: 4,
    name: 'Standard Research Use (Dataset)',
    description: 'Dataset grants only: view, list files, download',
    resource_types: ['DATASET'],
    access_type_ids: [1, 4, 5],
  },
];

const JWT_COOKIE_NAME = 'jwt';
const GRAFANA_COOKIE_NAME = 'grafana_token';

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
  UPLOAD_STATUS_GROUPS,
  UPLOAD_STATUS_FILTERS,
  WORKFLOWS,
  ALERT_TYPES,
  ALERT_STATUSES,
  DATASET_STATES,
  INCLUDE_PROJECTS,
  AUTHENTICATED_USERS_GROUP_ID,
  PUBLIC_GROUP_ID,
  SYSTEM_PRINCIPAL_GROUP_IDS,
  ANONYMOUS_PRINCIPAL,
  UNASSIGNED_DATASETS_GROUP_ID,
  SVC_TASKS_USER_ID,
  SVC_TASKS_SUBJECT_ID,
  GRANT_ACCESS_TYPES,
  GRANT_ACCESS_TYPE_IMPLICATIONS,
  GRANT_PRESETS,
  JWT_COOKIE_NAME,
  GRAFANA_COOKIE_NAME,
};
