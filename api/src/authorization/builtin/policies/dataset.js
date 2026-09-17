const { GRANT_ACCESS_TYPES } = require('@/constants');
const Policy = require('../../core/policies/Policy');
const PolicyContainer = require('../../core/policies/PolicyContainer');
const { mutating, reading, readingData } = require('../../core/policies/PolicyContainer');
const { platformAdminOnly } = require('./utils/index');
const { dataset: PUBLIC_ATTRIBUTES } = require('./base_attributes');

const VALID_GRANT_NAMES = new Set(GRANT_ACCESS_TYPES.map((g) => g.name));

class DatasetPolicy extends Policy {
  constructor({
    name, requires, evaluate, meta,
  }) {
    super({
      name, resourceType: 'dataset', requires, evaluate, meta,
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
  meta: { pathKind: 'admin' },
  requires: {
    context: ['access_paths'],
  },
  evaluate: (user, dataset, context) => context.access_paths.kinds.has('admin'),
});

/**
 * User has oversight authority over the group that owns this dataset.
 * Derived from being an admin of any strict ancestor of the owning group.
 * Read-only structural access.
 */
const hasDatasetOwningGroupOversight = new DatasetPolicy({
  name: 'hasDatasetOwningGroupOversight',
  meta: { pathKind: 'oversight' },
  requires: {
    context: ['access_paths'],
  },
  evaluate: (user, dataset, context) => context.access_paths.kinds.has('oversight'),
});

/**
 * User is an ordinary member of the owning group, and that group accepts contributions.
 *
 * Membership is effective rather than direct, so a member of a descendant group counts, the
 * same way `isGroupMember` treats it. This is the only policy that lets somebody who is not
 * an admin put a dataset into a group.
 *
 * @see docs/design/groups/dataset-creation.md — Contribution is a policy, not a comment
 */
const isDatasetOwningGroupContributor = new DatasetPolicy({
  name: 'isDatasetOwningGroupContributor',
  meta: { pathKind: 'member', rule: 'contributions_allowed' },
  requires: {
    resource: ['owner_group_allows_contributions'],
    context: ['access_paths'],
  },
  evaluate: (user, dataset, context) => dataset.owner_group_allows_contributions === true
    && context.access_paths.kinds.has('member'),
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
 * The check is a Set membership test against `context.access_paths.access_types`, the
 * widened types of the caller's grant paths to this dataset. No DB call fires inside evaluate().
 */
const userHasGrant = (access_type) => {
  if (!VALID_GRANT_NAMES.has(access_type)) {
    throw new Error(`Unknown grant access type: '${access_type}'`);
  }
  return new DatasetPolicy({
    name: `userHasGrant(${access_type})`,
    meta: { pathKind: 'grant', accessType: access_type },
    requires: {
      context: ['access_paths'],
    },
    evaluate: (user, dataset, context) => context.access_paths.access_types.has(access_type),
  });
};

// ============================================================================
// POLICY CONTAINER
// ============================================================================

const datasetPolicies = new PolicyContainer({
  resourceType: 'dataset',
  version: '1.0.0',
  description: 'Policies for Dataset resource',
});

// No policy below names the platform-admin role. The engine allows a platform admin every
// action before any of these run, so repeating the term here would be dead weight.
// @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
datasetPolicies
  .actions({

    // ------------------------------------------------------------------
    // CREATION
    // `create` is the governance action: only the owning group's admins.
    //
    // `contribute` is the ingestion action, and it is what the import and
    // upload routes check. It additionally admits an ordinary member of a
    // group that has allow_user_contributions set.
    // @see docs/design/groups/dataset-creation.md — Contribution is a policy, not a comment
    // ------------------------------------------------------------------
    create: mutating(isDatasetOwningGroupAdmin),

    contribute: mutating(Policy.or([
      isDatasetOwningGroupAdmin,
      isDatasetOwningGroupContributor,
    ])),

    // ------------------------------------------------------------------
    // EXISTENCE / METADATA VISIBILITY
    // Zero-default: non-privileged, non-grant-holding users cannot see
    // that this dataset exists at all — not in listings, not by ID.
    //
    // Allowed by:
    //   1. Owner group admin (structural authority)
    //   2. Oversight authority over owning group (structural, read-only)
    //   3. Active grant of type view_metadata
    // ------------------------------------------------------------------
    view_metadata: reading(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:VIEW_METADATA'),
    ])),

    // ------------------------------------------------------------------
    // SENSITIVE METADATA
    // Attributes such as origin_path, archive_path, staged_path,
    // infrastructure-level details. Requires an explicit elevated grant
    // beyond basic view_metadata.
    // ------------------------------------------------------------------
    view_sensitive_metadata: reading(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:VIEW_SENSITIVE_METADATA'),
    ])),

    // A list query scopes its rows to the caller, so the action itself admits anyone. Its
    // attribute rule decides the fields of every row, because no single row is decided.
    // @see docs/design/groups/access-model.md — Projection
    list: reading(Policy.always),

    // ------------------------------------------------------------------
    // FILE LISTINGS
    // Structural access (admin, oversight) can see file listings.
    // Grant holders need an explicit list_files grant — view_metadata
    // alone does NOT imply the ability to enumerate files.
    // ------------------------------------------------------------------
    list_files: readingData(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:LIST_FILES'),
    ])),

    // ------------------------------------------------------------------
    // DATA ACCESS (read / download / compute)
    // Each is a separate, independently grantable action.
    // Structural access (admin, oversight) does NOT confer data access.
    // Oversight is read-only over governance metadata — not data-plane.
    // ------------------------------------------------------------------
    // File listing is the read plane. There is no DATASET:READ_DATA access type, and this
    // checks DATASET:LIST_FILES on purpose rather than as a stand-in for one. The access
    // type order carries the rest: DOWNLOAD, COMPUTE, and REMOTE_ACCESS all imply
    // LIST_FILES, so any of them satisfies this check.
    // @see docs/design/groups/decisions.md — 7. Access types imply one another
    read_data: readingData(Policy.or([
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:LIST_FILES'),
    ])),

    download: readingData(Policy.or([
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:DOWNLOAD'),
    ])),

    compute: readingData(Policy.or([
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:COMPUTE'),
    ])),

    // Reading the dataset in place, from the path the storage layer exposes. The access type
    // was grantable with nothing checking it, so granting it conferred file listing through
    // the order and nothing named remote access.
    remote_access: readingData(Policy.or([
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:REMOTE_ACCESS'),
    ])),

    // ------------------------------------------------------------------
    // STAGING
    // Requesting that a dataset be staged is a data-plane action.
    // Requires an explicit grant — oversight does not include staging.
    // ------------------------------------------------------------------
    request_stage: mutating(Policy.or([
      isDatasetOwningGroupAdmin,
      userHasGrant('DATASET:DOWNLOAD'),
      userHasGrant('DATASET:COMPUTE'),
    ])),

    // ------------------------------------------------------------------
    // GOVERNANCE ACTIONS
    // Only the owner group's admins.
    // Oversight is read-only and never includes mutation authority.
    // ------------------------------------------------------------------
    edit_metadata: mutating(isDatasetOwningGroupAdmin),
    // A dataset has no archive: its lifecycle ends at delete, which removes the archived
    // files and cannot be undone. Groups and collections archive; datasets do not.
    // @see docs/design/groups/design.md — Operation Effects
    delete: mutating(isDatasetOwningGroupAdmin),
    transfer_ownership: mutating(isDatasetOwningGroupAdmin),
    edit: mutating(platformAdminOnly),

    // ------------------------------------------------------------------
    // GRANT MANAGEMENT
    // Only the owner group's admins may create, modify, or revoke grants
    // on a dataset.
    // ------------------------------------------------------------------
    manage_grants: mutating(isDatasetOwningGroupAdmin),

    // ------------------------------------------------------------------
    // ACCESS REQUEST REVIEW
    // Incoming access requests on this dataset are reviewed by the
    // owner group's admins.
    // ------------------------------------------------------------------
    review_access_requests: mutating(isDatasetOwningGroupAdmin),

    // ------------------------------------------------------------------
    // AUDIT LOG VISIBILITY
    // Owner group admins and oversight authorities can see audit logs.
    // Grant holders cannot — audit logs are governance metadata.
    // ------------------------------------------------------------------
    view_audit_logs: reading(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
    ])),

    // ------------------------------------------------------------------
    // WORKFLOW / PIPELINE STATUS
    // Operational status of ingestion/processing workflows.
    // Oversight includes this (see oversight spec §3).
    // Grant holders cannot see workflow internals.
    // ------------------------------------------------------------------
    view_workflows: reading(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
    ])),

    // ------------------------------------------------------------------
    // COLLECTION MEMBERSHIP
    // Which collections this dataset belongs to.
    // Only visible to structural actors — grant holders on the dataset
    // do not gain visibility into collection membership.
    // ------------------------------------------------------------------
    view_collections: reading(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
    ])),

    // ------------------------------------------------------------------
    // SOURCE DATASETS
    // View datasets that this dataset was derived from.
    // Structural actors can see source relationships (governance).
    // Grant holders need explicit grant to see source datasets.
    // ------------------------------------------------------------------
    view_source_datasets: reading(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:LIST_SOURCE_DATASETS'),
    ])),

    // ------------------------------------------------------------------
    // DERIVED DATASETS
    // View datasets that were derived from this dataset.
    // Structural actors can see derived relationships (governance).
    // Grant holders need explicit grant to see derived datasets.
    // ------------------------------------------------------------------
    view_derived_datasets: reading(Policy.or([
      isDatasetOwningGroupAdmin,
      hasDatasetOwningGroupOversight,
      userHasGrant('DATASET:LIST_DERIVED_DATASETS'),
    ])),
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
      // Owner group admin: full access
      {
        policy: isDatasetOwningGroupAdmin,
        attribute_filters: ['*'],
      },

      // Oversight: full governance metadata, no data-plane paths
      {
        policy: hasDatasetOwningGroupOversight,
        attribute_filters: PUBLIC_ATTRIBUTES.concat(
          [
            'num_directories', 'num_files', 'du_size', 'src_instrument_id',
            'metadata',
          // Paths withheld: oversight is governance-only, not infrastructure access
          // origin_path, archive_path, staged_path are excluded
          ],
        ),
      },

      // A caller sees the union of every matching rule, so an overseer who also holds a
      // sensitive-metadata grant sees the paths. tests/services/grants/grantHolderAttributes.test.js
      // runs each access type through these rules.

      // Grant holders (view_sensitive_metadata): adds infrastructure paths
      {
        policy: userHasGrant('DATASET:VIEW_SENSITIVE_METADATA'),
        attribute_filters: PUBLIC_ATTRIBUTES.concat([
          'num_directories', 'num_files', 'du_size', 'src_instrument_id',
          'metadata',
          'origin_path', 'archive_path', 'staged_path', // unlocked
        ]),
      },

      // Grant holders (list_files, and download, compute, and remote_access through the
      // order): adds the file count, which browsing the file tree already shows them.
      {
        policy: userHasGrant('DATASET:LIST_FILES'),
        attribute_filters: PUBLIC_ATTRIBUTES.concat(['num_files']),
      },

      // Grant holders (view_metadata): public-facing attributes only.
      // Infrastructure paths and sensitive metadata are excluded.
      {
        policy: userHasGrant('DATASET:VIEW_METADATA'),
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
    list: [
      {
        policy: Policy.always,
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
    view_source_datasets: [
      {
        policy: isDatasetOwningGroupAdmin,
        attribute_filters: ['*'],
      },
      {
        policy: hasDatasetOwningGroupOversight,
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
      {
        policy: userHasGrant('DATASET:LIST_SOURCE_DATASETS'),
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
    view_derived_datasets: [
      {
        policy: isDatasetOwningGroupAdmin,
        attribute_filters: ['*'],
      },
      {
        policy: hasDatasetOwningGroupOversight,
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
      {
        policy: userHasGrant('DATASET:LIST_DERIVED_DATASETS'),
        attribute_filters: PUBLIC_ATTRIBUTES,
      },
    ],
  })
  .freeze();

module.exports = { datasetPolicies };
