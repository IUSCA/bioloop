const datasetService = require('@/services/datasets_v2');
const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { isPlatformAdmin } = require('./utils/index');

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
 * Grant resolution includes:
 *   - Direct user grants (subject_type = USER, subject_id = user.id)
 *   - Group grants where the user is a transitive member of the subject group
 *     (subject_type = GROUP, subject_id ∈ user.effective_group_ids)
 *
 * Temporal validity (valid_from, valid_until, revoked_at) is enforced
 * inside datasetService.userHasGrant.
 */
const userHasGrant = (access_type) => new DatasetPolicy({
  name: `userHasGrant(${access_type})`,
  requires: {
    user: ['id'],
    resource: ['id'],
  },
  evaluate: (user, dataset) => datasetService.userHasGrant({
    user_id: user.id,
    dataset_id: dataset.id,
    access_type,
  }),
});

// ============================================================================
// POLICY CONTAINER
// ============================================================================

const datasetPolicies = new PolicyContainer({
  resourceType: 'dataset',
  version: '1.0.0',
  description: 'Policies for Dataset resource',
});

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
      userHasGrant('view_metadata'),
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
      userHasGrant('view_sensitive_metadata'),
    ]),

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
      userHasGrant('list_files'),
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
      userHasGrant('read_data'),
    ]),

    download: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      userHasGrant('download'),
    ]),

    compute: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      userHasGrant('compute'),
    ]),

    // ------------------------------------------------------------------
    // STAGING
    // Requesting that a dataset be staged is a data-plane action.
    // Requires an explicit grant — oversight does not include staging.
    // ------------------------------------------------------------------
    request_stage: Policy.or([
      isPlatformAdmin,
      isDatasetOwningGroupAdmin,
      userHasGrant('request_stage'),
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
        policy: userHasGrant('view_metadata'),
        attribute_filters: [
          'id', 'name', 'type', 'description',
          'num_directories', 'num_files', 'size', 'bundle_size',
          'is_deleted', 'is_staged',
          'created_at', 'updated_at',
          'src_instrument_id', 'owner_group_id',
          'metadata',
          // origin_path, archive_path, staged_path excluded
          // du_size excluded (internal accounting detail)
        ],
      },

      // Grant holders (view_sensitive_metadata): adds infrastructure paths
      {
        policy: userHasGrant('view_sensitive_metadata'),
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
  })
  .freeze();

module.exports = { datasetPolicies };
