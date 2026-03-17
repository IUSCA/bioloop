const { GRANT_ACCESS_TYPES } = require('@/constants');
const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { isPlatformAdmin } = require('./utils/index');

const VALID_GRANT_NAMES = new Set(GRANT_ACCESS_TYPES.map((g) => g.name));

class DatasetPolicy extends Policy {
  constructor({ name, requires, evaluate }) {
    super({
      name, resourceType: 'dataset', requires, evaluate,
    });
  }
}

// ============================================================================
// STRUCTURAL POLICIES
// These are derived from group membership, admin role, and oversight — not grants.
// ============================================================================

/**
 * User is an admin of the group that owns this dataset.
 * Direct admin authority — strongest structural access.
 */
const isDatasetOwningGroupAdmin = new DatasetPolicy({
  name: 'isDatasetOwningGroupAdmin',
  requires: {
    user: ['group_memberships'],
    resource: ['owner_group_id'],
  },
  evaluate: (user, dataset) => user
    .group_memberships
    .some(
      (membership) => membership.group_id === dataset.owner_group_id
        && membership.role === 'ADMIN',
    ),
});

/**
 * User has oversight authority over the group that owns this dataset.
 * Derived from being an admin of any strict ancestor of the owning group.
 * Read-only structural access.
 */
const hasDatasetOwningGroupOversight = new DatasetPolicy({
  name: 'hasDatasetOwningGroupOversight',
  requires: {
    user: ['oversight_group_ids'],
    resource: ['owner_group_id'],
  },
  evaluate: (user, dataset) => user.oversight_group_ids.includes(dataset.owner_group_id),
});

// ============================================================================
// GRANT-BASED POLICIES
// These are derived strictly from the presence of a durable grant row.
// Simply being a member of the owning group does NOT confer any of these.
// ============================================================================

/**
 * Factory: returns a policy that checks whether the user has an active grant
 * of the specified access_type on this dataset.
 *
 * The check is a pure Set membership test against `context.active_grant_access_types`,
 * a Set<string> pre-fetched once per request by the ContextHydrator virtual attribute
 * `active_grant_access_types`.  No DB call fires inside evaluate().
 */
const userHasGrant = (access_type) => {
  if (!VALID_GRANT_NAMES.has(access_type)) {
    throw new Error(`Unknown grant access type: '${access_type}'`);
  }
  return new DatasetPolicy({
    name: `userHasGrant(${access_type})`,
    requires: {
      user: [],
      resource: [],
      context: ['active_grant_access_types'],
    },
    evaluate: (user, dataset, context) => context.active_grant_access_types.has(access_type),
  });
};

const callerRoles = Object.freeze({
  PLATFORM_ADMIN: 'ADMIN',
  DATASET_OWNER_GROUP_ADMIN: 'ADMIN',
  DATASET_OWNER_GROUP_OVERSIGHT: 'OVERSIGHT',
  GRANT_HOLDER: 'GRANT_HOLDER',
});

// ============================================================================
// POLICY CONTAINER
// ============================================================================

const datasetPolicies = new PolicyContainer({
  resourceType: 'dataset',
  version: '1.0.0',
  description: 'Policies for Dataset resource',
});

const PUBLIC_ATTRIBUTES = Object.freeze([
  'id', 'name', 'type', 'description', 'size', 'bundle_size',
  'is_deleted',
  'created_at', 'updated_at', 'owner_group_id',
  // metadata is excluded unless a more specific rule is known, ex: metadata.type
  // num_directories, num_files, is_staged are excluded as internal accounting details that are not relevant to all users
  // src_instrument_id needs a valid reason to be exposed, so excluded by default
  // Paths are excluded by default as they are sensitive infrastructure details
  // origin_path, archive_path, staged_path excluded
  // du_size excluded (internal accounting detail)
]);

datasetPolicies
  .actions({

    // ------------------------------------------------------------------
    // CREATION
    // Platform admins can create datasets for any group.
    // Group admins can create datasets owned by their group.
    // Normal users cannot create datasets directly — they contribute via
    // the upload pathway which is gated by group.allow_user_contributions
    // and enforced at the service layer, not the policy layer.
    // ------------------------------------------------------------------
    create: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),

    // ------------------------------------------------------------------
    // EXISTENCE / METADATA VISIBILITY
    // Zero-default: non-privileged, non-grant-holding users cannot see
    // that this dataset exists at all — not in listings, not by ID.
    //
    // Allowed by:
    //   1. Platform admin
    //   2. Owner group admin (structural authority)
    //   3. Oversight authority over owning group (structural, read-only)
    //   4. Active grant of type view_metadata
    // ------------------------------------------------------------------
    view_metadata: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:VIEW_METADATA'),
    ]),

    // ------------------------------------------------------------------
    // SENSITIVE METADATA
    // Attributes such as origin_path, archive_path, staged_path,
    // infrastructure-level details. Requires an explicit elevated grant
    // beyond basic view_metadata.
    // ------------------------------------------------------------------
    view_sensitive_metadata: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:VIEW_SENSITIVE_METADATA'),
    ]),

    list: Policy.always, // anyone can list, but service layer filters to only what they have access to

    // ------------------------------------------------------------------
    // FILE LISTINGS
    // Structural access (admin, oversight) can see file listings.
    // Grant holders need an explicit list_files grant — view_metadata
    // alone does NOT imply the ability to enumerate files.
    // ------------------------------------------------------------------
    list_files: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:READ_DATA'),
    ]),

    // ------------------------------------------------------------------
    // DATA ACCESS (read / download / compute)
    // Each is a separate, independently grantable action.
    // Structural access (admin, oversight) does NOT confer data access.
    // Oversight is read-only over governance metadata — not data-plane.
    // ------------------------------------------------------------------
    read_data: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:READ_DATA'),
    ]),

    download: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:DOWNLOAD'),
    ]),

    compute: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:COMPUTE'),
    ]),

    // ------------------------------------------------------------------
    // STAGING
    // Requesting that a dataset be staged is a data-plane action.
    // Requires an explicit grant — oversight does not include staging.
    // ------------------------------------------------------------------
    request_stage: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:DOWNLOAD'),
      userHasGrant('DATASET:COMPUTE'),
    ]),

    // ------------------------------------------------------------------
    // GOVERNANCE ACTIONS
    // Only platform admins and owner group admins.
    // Oversight is read-only and never includes mutation authority.
    // ------------------------------------------------------------------
    edit_metadata: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),
    archive: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),
    unarchive: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),
    transfer_ownership: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),
    edit: Policy.or([isPlatformAdmin]),

    // ------------------------------------------------------------------
    // GRANT MANAGEMENT
    // Only the owner group's admins (and platform admins) may create,
    // modify, or revoke grants on a dataset.
    // ------------------------------------------------------------------
    manage_grants: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),

    // ------------------------------------------------------------------
    // ACCESS REQUEST REVIEW
    // Incoming access requests on this dataset are reviewed by the
    // owner group's admins.
    // ------------------------------------------------------------------
    review_access_requests: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),

    // ------------------------------------------------------------------
    // AUDIT LOG VISIBILITY
    // Owner group admins and oversight authorities can see audit logs.
    // Grant holders cannot — audit logs are governance metadata.
    // ------------------------------------------------------------------
    view_audit_logs: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
    ]),

    // ------------------------------------------------------------------
    // WORKFLOW / PIPELINE STATUS
    // Operational status of ingestion/processing workflows.
    // Oversight includes this (see oversight spec §3).
    // Grant holders cannot see workflow internals.
    // ------------------------------------------------------------------
    view_workflows: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
    ]),

    // ------------------------------------------------------------------
    // COLLECTION MEMBERSHIP
    // Which collections this dataset belongs to.
    // Only visible to structural actors — grant holders on the dataset
    // do not gain visibility into collection membership.
    // ------------------------------------------------------------------
    view_collections: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
    ]),
  })

  .attributes({
    // ------------------------------------------------------------------
    // ATTRIBUTE FILTERS PER ACTION
    //
    // The action wildcard '*' defines what each policy class can see
    // across any action they are authorized for.
    //
    // Sensitive infrastructure attributes are withheld from grant holders
    // even when they have view_metadata — those require view_sensitive_metadata.
    // ------------------------------------------------------------------
    '*': [
      // Platform admin and owner group admin: full access
      {
        policy: Policy.or([isPlatformAdmin, isDatasetOwningGroupAdmin]),
        attribute_filters: ['*'],
      },

      // Oversight: full governance metadata, no data-plane paths
      {
        policy: hasDatasetOwningGroupOversight,
        attribute_filters: [
          'id', 'name', 'type', 'description',
          'num_directories', 'num_files', 'size', 'du_size', 'bundle_size',
          'is_deleted', 'is_staged',
          'created_at', 'updated_at',
          'src_instrument_id', 'owner_group_id',
          'metadata',
          // Paths withheld: oversight is governance-only, not infrastructure access
          // origin_path, archive_path, staged_path are excluded
        ],
      },

      // Grant holders (view_metadata): public-facing attributes only.
      // Infrastructure paths and sensitive metadata are excluded.
      {
        policy: userHasGrant('DATASET:VIEW_METADATA'),
        attribute_filters: PUBLIC_ATTRIBUTES,
      },

      // Grant holders (view_sensitive_metadata): adds infrastructure paths
      {
        policy: userHasGrant('DATASET:VIEW_SENSITIVE_METADATA'),
        attribute_filters: [
          'id', 'name', 'type', 'description',
          'num_directories', 'num_files', 'size', 'du_size', 'bundle_size',
          'is_deleted', 'is_staged',
          'created_at', 'updated_at',
          'src_instrument_id', 'owner_group_id',
          'metadata',
          'origin_path', 'archive_path', 'staged_path', // unlocked
        ],
      },
    ],
    list: [
      {
        policy: isPlatformAdmin,
        attribute_filters: ['*'],
      },
      {
        policy: Policy.always,
        attribute_filters: PUBLIC_ATTRIBUTES, // listing only returns public attributes, even for structural roles
      },
    ],
  })
  .roles([
    { policy: isPlatformAdmin, role: callerRoles.PLATFORM_ADMIN },
    { policy: isDatasetOwningGroupAdmin, role: callerRoles.DATASET_OWNER_GROUP_ADMIN },
    { policy: hasDatasetOwningGroupOversight, role: callerRoles.DATASET_OWNER_GROUP_OVERSIGHT },
    {
      policy: Policy.or([
        userHasGrant('DATASET:VIEW_METADATA'),
        userHasGrant('DATASET:READ_DATA'),
        userHasGrant('DATASET:VIEW_SENSITIVE_METADATA'),
        userHasGrant('DATASET:READ_DATA'),
        userHasGrant('DATASET:DOWNLOAD'),
        userHasGrant('DATASET:COMPUTE'),
      ]),
      role: callerRoles.GRANT_HOLDER,
    },
  ])
  .freeze();

module.exports = { datasetPolicies };
