---
title: Implementation Spec
---

# Hierarchical Groups & Access Control Implementation Spec

This spec defines the data models, module structure, and function declarations needed to implement the hierarchical groups, collections, and access control system described in the design documents. It follows existing codebase patterns (route → service → database, ABAC policies, audit trails) while introducing the new authorization primitives (ownership, grants, closure tables).

**Steps**
1. Extend [api/prisma/schema.prisma](api/prisma/schema.prisma) with new models for groups, closures, collections, grants, and access requests
2. Create service modules in [api/src/services/](api/src/services/) for core domain logic
3. Create route modules in [api/src/routes/](api/src/routes/) following REST conventions
4. Create ABAC policy modules in [api/src/authorization/policies/](api/src/authorization/policies/)
5. Define middleware utilities in [api/src/middleware/](api/src/middleware/) for grant evaluation
6. Define database migration strategy and seed data structure

**Verification**
- Schema passes Prisma validation
- All foreign key relationships are correct
- Closure table indexes support efficient transitive queries
- Function signatures align with existing codebase patterns
- Module organization follows established conventions

---

## 1. Data Models (Prisma Schema Extensions)

### Core Entities

```prisma
// ============================================================================
// GROUPS - Hierarchical organizational structure
// ============================================================================

model group {
  id          String   @id @default(uuid())
  name        String   @unique
  slug        String   @unique
  description String?
  
  // Lifecycle
  created_at  DateTime @default(now()) @db.Timestamp(6)
  updated_at  DateTime @default(now()) @updatedAt @db.Timestamp(6)
  archived_at DateTime? @db.Timestamp(6)
  is_archived Boolean  @default(false)
  
  // Settings
  allow_user_contributions Boolean @default(false)
  metadata    Json?
  
  // Relations
  members            group_user[]
  ancestor_edges     group_closure[] @relation("group_ancestors")
  descendant_edges   group_closure[] @relation("group_descendants")
  owned_datasets     dataset[]
  owned_collections  collection[]
  grants_as_subject  grant[] @relation("group_grants")
}

// Closure table for efficient hierarchy traversal
model group_closure {
  ancestor_id   String
  descendant_id String
  depth         Int
  
  ancestor      group @relation("group_ancestors", fields: [ancestor_id], references: [id], onDelete: Cascade)
  descendant    group @relation("group_descendants", fields: [descendant_id], references: [id], onDelete: Cascade)
  
  @@id([ancestor_id, descendant_id])
  @@index([descendant_id, depth])
  @@index([ancestor_id, depth])
}

// Group membership (transitive upward)
model group_user {
  group_id    String
  user_id     Int
  role        GROUP_ROLE @default(MEMBER)
  assigned_at DateTime @default(now()) @db.Timestamp(6)
  assigned_by Int?
  
  group       group @relation(fields: [group_id], references: [id], onDelete: Cascade)
  user        user  @relation("user_memberships", fields: [user_id], references: [id], onDelete: Cascade)
  assignor    user? @relation("membership_assignor", fields: [assigned_by], references: [id], onDelete: SetNull)
  
  @@id([group_id, user_id])
  @@index([user_id])
}

enum GROUP_ROLE {
  MEMBER
  ADMIN
}

// ============================================================================
// COLLECTIONS - Authorization containers for datasets
// ============================================================================

model collection {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  description String?
  
  // Ownership (single owning group)
  owner_group_id String
  owner_group    group @relation(fields: [owner_group_id], references: [id], onDelete: Restrict)
  
  // Lifecycle
  created_at  DateTime @default(now()) @db.Timestamp(6)
  updated_at  DateTime @default(now()) @updatedAt @db.Timestamp(6)
  archived_at DateTime? @db.Timestamp(6)
  is_archived Boolean  @default(false)
  
  // Settings
  metadata    Json?
  
  // Relations
  datasets    collection_dataset[]
  grants      grant[] @relation("collection_grants")
  access_requests access_request[] @relation("collection_requests")
  
  @@index([owner_group_id])
  @@index([is_archived])
}

model collection_dataset {
  collection_id String
  dataset_id    Int
  added_at      DateTime @default(now()) @db.Timestamp(6)
  added_by      Int?
  
  collection    collection @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  dataset       dataset    @relation(fields: [dataset_id], references: [id], onDelete: Cascade)
  adder         user?      @relation("collection_dataset_adder", fields: [added_by], references: [id], onDelete: SetNull)
  
  @@id([collection_id, dataset_id])
  @@index([dataset_id])
}

// ============================================================================
// GRANTS - Durable authorization facts
// ============================================================================

model grant {
  id          String   @id @default(uuid())
  
  // Subject (who receives access)
  subject_type GRANT_SUBJECT_TYPE
  subject_id   String  // user.id or group.id (as string)
  
  // Resource (what is being accessed)
  resource_type GRANT_RESOURCE_TYPE
  resource_id   String // dataset.id or collection.id
  
  // Access type (what action is allowed) - atomic granularity by design
  access_type  GRANT_ACCESS_TYPE
  
  // Temporal bounds
  valid_from   DateTime  @default(now()) @db.Timestamp(6)
  valid_until  DateTime? @db.Timestamp(6)
  
  // Status
  status       GRANT_STATUS @default(ACTIVE)
  
  // Provenance
  granted_by   Int
  granted_via_group String?  // Authority basis: which group's admin role authorized this
  created_at   DateTime @default(now()) @db.Timestamp(6)
  revoked_at   DateTime? @db.Timestamp(6)
  revoked_by   Int?
  
  // Relations
  grantor      user   @relation("grants_created", fields: [granted_by], references: [id], onDelete: Restrict)
  revoker      user?  @relation("grants_revoked", fields: [revoked_by], references: [id], onDelete: SetNull)
  authority_group group? @relation("group_grants", fields: [granted_via_group], references: [id], onDelete: SetNull)
  
  // Resource relations (nullable because of polymorphic reference)
  dataset_resource     dataset?    @relation("dataset_grants", fields: [resource_id], references: [id], onDelete: Cascade)
  collection_resource  collection? @relation("collection_grants", fields: [resource_id], references: [id], onDelete: Cascade)
  
  @@index([subject_type, subject_id, status])
  @@index([resource_type, resource_id, status])
  @@index([status, valid_from, valid_until])
  @@index([granted_via_group])
}

enum GRANT_SUBJECT_TYPE {
  USER
  GROUP
}

enum GRANT_RESOURCE_TYPE {
  DATASET
  COLLECTION
}

enum GRANT_ACCESS_TYPE {
  // Dataset consumption actions (grantable)
  VIEW_METADATA
  VIEW_SENSITIVE_METADATA
  READ_DATA
  DOWNLOAD
  COMPUTE
}

enum GRANT_STATUS {
  ACTIVE
  REVOKED
  EXPIRED
}

// ============================================================================
// ACCESS REQUESTS - Workflow objects (not authorization primitives)
// ============================================================================

model access_request {
  id          String   @id @default(uuid())
  
  // Request type
  type        ACCESS_REQUEST_TYPE
  
  // Target resource
  resource_type GRANT_RESOURCE_TYPE
  resource_id   String
  
  // Requested actions (multiple consumption actions)
  requested_actions GRANT_ACCESS_TYPE[]
  
  // Requester
  requester_id Int
  requester    user @relation("access_requests_created", fields: [requester_id], references: [id], onDelete: Cascade)
  
  // Justification
  purpose      String?
  duration_days Int?
  
  // Prior context (for renewals)
  previous_grant_ids String[] // References expired grants
  
  // Status
  status       ACCESS_REQUEST_STATUS @default(DRAFT)
  
  // Review
  reviewed_by  Int?
  reviewed_at  DateTime? @db.Timestamp(6)
  decision_reason String?
  approved_actions GRANT_ACCESS_TYPE[] // Subset of requested_actions that were approved
  
  // Lifecycle
  created_at   DateTime @default(now()) @db.Timestamp(6)
  updated_at   DateTime @default(now()) @updatedAt @db.Timestamp(6)
  submitted_at DateTime? @db.Timestamp(6)
  closed_at    DateTime? @db.Timestamp(6)
  
  // Relations
  reviewer     user? @relation("access_requests_reviewed", fields: [reviewed_by], references: [id], onDelete: SetNull)
  
  // Resource relations
  dataset_resource     dataset?    @relation("dataset_requests", fields: [resource_id], references: [id], onDelete: Cascade)
  collection_resource  collection? @relation("collection_requests", fields: [resource_id], references: [id], onDelete: Cascade)
  
  @@index([requester_id, status])
  @@index([resource_type, resource_id, status])
  @@index([status, submitted_at])
}

enum ACCESS_REQUEST_TYPE {
  NEW
  RENEWAL
}

enum ACCESS_REQUEST_STATUS {
  DRAFT
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  PARTIALLY_APPROVED
  REJECTED
  WITHDRAWN
  EXPIRED
  CLOSED
}

// ============================================================================
// DATASET EXTENSIONS - Add ownership and visibility
// ============================================================================

// Extend existing dataset model:
model dataset {
  // ... existing fields ...
  
  // NEW: Ownership (single owning group)
  //  TODO: make it mandatory in a later migration after we have a process for assigning existing datasets to groups
  owner_group_id String?
  owner_group    group? @relation(fields: [owner_group_id], references: [id], onDelete: Restrict)
  
  // NEW: Relations
  collections        collection_dataset[]
  grants             grant[] @relation("dataset_grants")
  access_requests    access_request[] @relation("dataset_requests")
  
  @@index([owner_group_id])
}

enum DATASET_VISIBILITY {
  PUBLIC              // Grant(read_data) → Everyone
  DISCOVERABLE        // Grant(view_metadata) → Everyone
  GROUP_VISIBLE       // Grant(read_data) → owner_group (transitive)
  GROUP_DISCOVERABLE  // Grant(view_metadata) → owner_group (transitive)
  STEWARD_ONLY        // No automatic grants
}

// ============================================================================
// USER EXTENSIONS - Add group relations
// ============================================================================

// Extend existing user model:
model user {
  // ... existing fields ...
  
  // NEW: Group relations
  group_memberships    group_user[]  @relation("user_memberships")
  group_admin_roles    group_admin[] @relation("user_admin_groups")
  
  // NEW: Grant and request relations
  grants_created       grant[]        @relation("grants_created")
  grants_revoked       grant[]        @relation("grants_revoked")
  access_requests      access_request[] @relation("access_requests_created")
  access_requests_reviewed access_request[] @relation("access_requests_reviewed")
  
  // NEW: Assignment relations
  memberships_assigned group_user[]  @relation("membership_assignor")
  admins_assigned      group_admin[] @relation("admin_assignor")
  collection_datasets_added collection_dataset[] @relation("collection_dataset_adder")
}

// ============================================================================
// AUDIT LOG - Authorization events
// ============================================================================

model authorization_audit {
  id          Int      @id @default(autoincrement())
  timestamp   DateTime @default(now()) @db.Timestamp(6)
  
  // Event type
  event_type  String
  
  // Actor
  actor_id    Int?
  actor       user? @relation(fields: [actor_id], references: [id], onDelete: SetNull)
  
  // Target
  target_type String  // 'user', 'group', 'dataset', 'collection', 'grant'
  target_id   String
  
  // Details
  action      String?  // 'create', 'revoke', 'approve', 'reparent', etc.
  metadata    Json?
  
  // Authorization decision context (for access checks)
  resource_type String?
  resource_id   String?
  decision      Boolean?
  reason        String?
  
  @@index([event_type, timestamp])
  @@index([actor_id])
  @@index([target_type, target_id])
}

// enum AUTH_EVENT_TYPE {
//   ACCESS_CHECK      // Authorization decision was made
//   GRANT_CREATED
//   GRANT_REVOKED
//   GRANT_EXPIRED
//   REQUEST_CREATED
//   REQUEST_APPROVED
//   REQUEST_REJECTED
//   REQUEST_WITHDRAWN
//   GROUP_CREATED
//   GROUP_ARCHIVED
//   GROUP_REPARENTED
//   MEMBERSHIP_ADDED
//   MEMBERSHIP_REMOVED
//   ADMIN_ADDED
//   ADMIN_REMOVED
//   COLLECTION_CREATED
//   COLLECTION_DATASET_ADDED
//   COLLECTION_DATASET_REMOVED
//   DATASET_OWNERSHIP_TRANSFERRED
//   VISIBILITY_CHANGED
// }
```

---

## 2. Service Layer Function Declarations

### api/src/services/group.js

```javascript
/**
 * Group Service
 * Handles hierarchical group operations and closure table maintenance
 */

// ============================================================================
// Group Lifecycle
// ============================================================================

/**
 * Create a new group
 * @param {Object} data - Group creation data
 * @param {string} data.name - Group name (unique)
 * @param {string} data.slug - URL-friendly identifier
 * @param {string} [data.description] - Optional description
 * @param {boolean} [data.allow_user_contributions] - Whether users can upload
 * @param {Object} [data.metadata] - Additional metadata
 * @param {number} actor_id - User creating the group
 * @returns {Promise<Object>} Created group with closure entries
 */
async function createGroup(data, actor_id)

/**
 * Archive a group (soft delete)
 * @param {string} group_id - Group to archive
 * @param {number} actor_id - User performing action
 * @returns {Promise<Object>} Archived group
 * @throws {ForbiddenError} If group has active datasets or children
 */
async function archiveGroup(group_id, actor_id)

/**
 * Reparent a group (move in hierarchy)
 * @param {string} group_id - Group to move
 * @param {string} new_parent_id - New parent group ID
 * @param {number} actor_id - User performing action (must be admin of both)
 * @returns {Promise<Object>} Updated group with new closure paths
 * @throws {ForbiddenError} If would create cycle or violate authority
 */
// async function reparentGroup(group_id, new_parent_id, actor_id) - Don't implement until we have a use case for it, as it's complex and not currently needed

// ============================================================================
// Group Membership
// ============================================================================

/**
 * Add a user to a group
 * @param {string} group_id
 * @param {number} user_id
 * @param {number} assignor_id - Admin performing the action
 * @returns {Promise<Object>} Membership record
 */
async function addMember(group_id, user_id, assignor_id)

/**
 * Remove a user from a group
 * @param {string} group_id
 * @param {number} user_id
 * @param {number} assignor_id
 * @returns {Promise<void>}
 */
async function removeMember(group_id, user_id, assignor_id)

/**
 * Add admin role to a user
 * @param {string} group_id
 * @param {number} user_id
 * @param {number} assignor_id
 * @returns {Promise<Object>} Admin record
 */
async function addAdmin(group_id, user_id, assignor_id)

/**
 * Remove admin role from a user
 * @param {string} group_id
 * @param {number} user_id
 * @param {number} assignor_id
 * @returns {Promise<void>}
 */
async function removeAdmin(group_id, user_id, assignor_id)

/**
 * Bulk add members to group
 * @param {string} group_id
 * @param {number[]} user_ids
 * @param {number} assignor_id
 * @returns {Promise<Object[]>} Created membership records
 */
async function bulkAddMembers(group_id, user_ids, assignor_id)

// ============================================================================
// Group Queries
// ============================================================================

/**
 * Get all groups a user is a member of (transitive via closure)
 * @param {number} user_id
 * @param {boolean} [include_archived=false]
 * @returns {Promise<string[]>} Array of group IDs
 */
async function getUserGroupIds(user_id, include_archived = false)

/**
 * Get all groups where user is admin (local, not transitive)
 * @param {number} user_id
 * @returns {Promise<string[]>} Array of group IDs
 */
async function getUserAdminGroupIds(user_id)

/**
 * Get all ancestor groups (upward transitive)
 * @param {string} group_id
 * @returns {Promise<Object[]>} Ancestor groups with depth
 */
async function getAncestors(group_id)

/**
 * Get all descendant groups (downward transitive)
 * @param {string} group_id
 * @returns {Promise<Object[]>} Descendant groups with depth
 */
async function getDescendants(group_id)

/**
 * Get all descendant members (users in this group or any child)
 * @param {string} group_id
 * @returns {Promise<number[]>} Array of user IDs
 */
async function getDescendantMemberIds(group_id)

/**
 * Get all ancestor admins (who have oversight visibility)
 * @param {string} group_id
 * @returns {Promise<number[]>} Array of user IDs
 */
async function getOversightAdminIds(group_id)

/**
 * Check if user is member of group (direct or transitive)
 * @param {number} user_id
 * @param {string} group_id
 * @returns {Promise<boolean>}
 */
async function isMember(user_id, group_id)

/**
 * Check if user is admin of group (local only)
 * @param {number} user_id
 * @param {string} group_id
 * @returns {Promise<boolean>}
 */
async function isAdmin(user_id, group_id)

/**
 * Check if user has oversight view (admin of ancestor)
 * @param {number} user_id
 * @param {string} group_id
 * @returns {Promise<boolean>}
 */
async function hasOversightView(user_id, group_id)

/**
 * Get group by ID with full hierarchy context
 * @param {string} group_id
 * @param {Object} [options] - Include options
 * @returns {Promise<Object>} Group with members, admins, ancestors, etc.
 */
async function findGroupById(group_id, options = {})

/**
 * Get groups eligible for dataset upload by user
 * @param {number} user_id
 * @returns {Promise<Object[]>} Groups where user can contribute
 */
async function getContributionEligibleGroups(user_id)

// ============================================================================
// Closure Table Maintenance (Internal)
// ============================================================================

/**
 * Rebuild closure table entries for a group and its hierarchy
 * @private
 * @param {string} group_id
 * @returns {Promise<void>}
 */
async function rebuildClosureTable(group_id)

/**
 * Insert closure paths when adding parent relationship
 * @private
 * @param {string} parent_id
 * @param {string} child_id
 * @returns {Promise<void>}
 */
async function insertClosurePaths(parent_id, child_id)

/**
 * Remove closure paths when removing parent relationship
 * @private
 * @param {string} parent_id
 * @param {string} child_id
 * @returns {Promise<void>}
 */
async function removeClosurePaths(parent_id, child_id)

/**
 * Validate that operation would not create cycle
 * @private
 * @param {string} potential_parent_id
 * @param {string} child_id
 * @returns {Promise<boolean>}
 */
async function wouldCreateCycle(potential_parent_id, child_id)
```

### api/src/services/collection.js

```javascript
/**
 * Collection Service
 * Handles dataset groupings for authorization
 */

// ============================================================================
// Collection Lifecycle
// ============================================================================

/**
 * Create a collection
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.slug
 * @param {string} data.owner_group_id - Owning group
 * @param {string} [data.description]
 * @param {number} actor_id - Must be admin of owner_group
 * @returns {Promise<Object>} Created collection
 */
async function createCollection(data, actor_id)

/**
 * Archive a collection
 * @param {string} collection_id
 * @param {number} actor_id
 * @returns {Promise<Object>} Archived collection
 */
async function archiveCollection(collection_id, actor_id)

/**
 * Transfer collection ownership
 * @param {string} collection_id
 * @param {string} new_owner_group_id
 * @param {number} actor_id - Must be admin of both groups
 * @returns {Promise<Object>} Updated collection
 */
// async function transferOwnership(collection_id, new_owner_group_id, actor_id) - Don't implement until we have a use case for it, as it's complex and not currently needed

// ============================================================================
// Collection Membership
// ============================================================================

/**
 * Add dataset to collection
 * Enforces: dataset.owner_group_id === collection.owner_group_id
 * @param {string} collection_id
 * @param {number} dataset_id
 * @param {number} actor_id - Must be admin of owner group
 * @returns {Promise<Object>} Membership record
 * @throws {ForbiddenError} If ownership mismatch
 */
async function addDataset(collection_id, dataset_id, actor_id)

/**
 * Remove dataset from collection
 * Note: Existing collection-based grants remain but no longer provide access
 * @param {string} collection_id
 * @param {number} dataset_id
 * @param {number} actor_id
 * @returns {Promise<void>}
 */
async function removeDataset(collection_id, dataset_id, actor_id)

/**
 * Bulk add datasets to collection
 * @param {string} collection_id
 * @param {number[]} dataset_ids
 * @param {number} actor_id
 * @returns {Promise<Object[]>} Created records
 */
async function bulkAddDatasets(collection_id, dataset_ids, actor_id)


/**
 * Bulk remove datasets from collection
 * @param {string} collection_id
 * @param {number[]} dataset_ids
 * @param {number} actor_id
 * @returns {Promise<Object[]>} Removed records
 */
async function bulkRemoveDatasets(collection_id, dataset_ids, actor_id)

// ============================================================================
// Collection Queries
// ============================================================================

/**
 * Get collection by ID with datasets
 * @param {string} collection_id
 * @param {Object} [options] - Include datasets, owner_group, etc.
 * @returns {Promise<Object>} Collection
 */
async function findCollectionById(collection_id, options = {})

/**
 * Get all collections owned by a group
 * @param {string} group_id
 * @returns {Promise<Object[]>}
 */
async function findCollectionsByOwnerGroup(group_id)

/**
 * Get all collections containing a dataset
 * @param {number} dataset_id
 * @returns {Promise<Object[]>}
 */
async function findCollectionsByDataset(dataset_id)

/**
 * Check if dataset is in collection
 * @param {string} collection_id
 * @param {number} dataset_id
 * @returns {Promise<boolean>}
 */
async function containsDataset(collection_id, dataset_id)
```

### api/src/services/grant.js

```javascript
/**
 * Grant Service
 * Manages durable authorization facts
 */

// ============================================================================
// Grant Creation
// ============================================================================

/**
 * Create a grant (direct authorization)
 * @param {Object} data
 * @param {string} data.subject_type - 'USER' or 'GROUP'
 * @param {string} data.subject_id - User ID or Group ID
 * @param {string} data.resource_type - 'DATASET' or 'COLLECTION'
 * @param {string} data.resource_id
 * @param {string} data.access_type - GRANT_ACCESS_TYPE enum
 * @param {Date} [data.valid_from] - Defaults to now
 * @param {Date} [data.valid_until] - Expiration date
 * @param {number} granted_by - Actor user ID
 * @param {string} granted_via_group - Authority group ID
 * @returns {Promise<Object>} Created grant
 */
async function createGrant(data, granted_by, granted_via_group)

/**
 * Create multiple grants atomically
 * @param {Object[]} grants - Array of grant data objects
 * @param {number} granted_by
 * @param {string} granted_via_group
 * @returns {Promise<Object[]>} Created grants
 */
async function createGrantsBatch(grants, granted_by, granted_via_group)

/**
 * Revoke a grant
 * @param {string} grant_id
 * @param {number} revoked_by
 * @param {string} [reason] - Optional revocation reason
 * @returns {Promise<Object>} Revoked grant
 */
async function revokeGrant(grant_id, revoked_by, reason)

/**
 * Revoke multiple grants matching criteria
 * @param {Object} criteria
 * @param {string} [criteria.subject_id]
 * @param {string} [criteria.resource_id]
 * @param {number} revoked_by
 * @returns {Promise<number>} Count of revoked grants
 */
async function revokeGrantsBatch(criteria, revoked_by)

// ============================================================================
// Grant Queries
// ============================================================================

/**
 * Find active grants for a subject
 * @param {string} subject_type - 'USER' or 'GROUP'
 * @param {string} subject_id
 * @param {Object} [filters] - Resource type/ID filters
 * @returns {Promise<Object[]>} Active grants
 */
async function findActiveGrantsForSubject(subject_type, subject_id, filters = {})

/**
 * Find active grants for a resource
 * @param {string} resource_type - 'DATASET' or 'COLLECTION'
 * @param {string} resource_id
 * @returns {Promise<Object[]>} Active grants
 */
async function findActiveGrantsForResource(resource_type, resource_id)

/**
 * Get grant by ID
 * @param {string} grant_id
 * @returns {Promise<Object|null>}
 */
async function findGrantById(grant_id)

/**
 * Check if a specific grant exists and is active
 * @param {Object} criteria - Exact match criteria
 * @returns {Promise<boolean>}
 */
async function hasActiveGrant(criteria)

/**
 * Get expiring grants (for notification/renewal reminders)
 * @param {number} days_ahead - Look ahead window
 * @returns {Promise<Object[]>} Grants expiring soon
 */
async function findExpiringGrants(days_ahead)

/**
 * Mark expired grants (batch job)
 * @returns {Promise<number>} Count of expired grants
 */
async function expireOutdatedGrants()

// ============================================================================
// Visibility Preset Grants
// ============================================================================

/**
 * Emit template grants based on dataset visibility preset
 * @param {number} dataset_id
 * @param {string} visibility - DATASET_VISIBILITY enum
 * @param {string} owner_group_id
 * @returns {Promise<Object[]>} Created grants
 */
async function emitVisibilityGrants(dataset_id, visibility, owner_group_id)

/**
 * Revoke template grants when visibility changes
 * @param {number} dataset_id
 * @param {string} old_visibility
 * @returns {Promise<number>} Count of revoked grants
 */
async function revokeVisibilityGrants(dataset_id, old_visibility)
```

### api/src/services/accessRequest.js

```javascript
/**
 * Access Request Service
 * Manages approval workflow (not authorization itself)
 */

// ============================================================================
// Request Lifecycle
// ============================================================================

/**
 * Create a new access request (draft)
 * @param {Object} data
 * @param {string} data.type - 'NEW' or 'RENEWAL'
 * @param {string} data.resource_type - 'DATASET' or 'COLLECTION'
 * @param {string} data.resource_id
 * @param {string[]} data.requested_actions - Array of GRANT_ACCESS_TYPE
 * @param {string} [data.purpose] - Justification
 * @param {number} [data.duration_days] - Requested duration
 * @param {string[]} [data.previous_grant_ids] - For renewals
 * @param {number} requester_id
 * @returns {Promise<Object>} Created request in DRAFT status
 */
async function createAccessRequest(data, requester_id)

/**
 * Submit a request for review
 * @param {string} request_id
 * @param {number} requester_id
 * @returns {Promise<Object>} Request in SUBMITTED status
 */
async function submitRequest(request_id, requester_id)

/**
 * Approve a request (creates grants)
 * @param {string} request_id
 * @param {number} reviewer_id - Must be admin of resource owner group
 * @param {Object} [options]
 * @param {string[]} [options.approved_actions] - Subset of requested (for partial)
 * @param {number} [options.duration_days] - Override requested duration
 * @param {string} [options.decision_reason]
 * @returns {Promise<{request: Object, grants: Object[]}}>
 */
async function approveRequest(request_id, reviewer_id, options = {})

/**
 * Reject a request
 * @param {string} request_id
 * @param {number} reviewer_id
 * @param {string} decision_reason - Required
 * @returns {Promise<Object>} Rejected request
 */
async function rejectRequest(request_id, reviewer_id, decision_reason)

/**
 * Withdraw a request (by requester)
 * @param {string} request_id
 * @param {number} requester_id
 * @returns {Promise<Object>} Withdrawn request
 */
async function withdrawRequest(request_id, requester_id)

/**
 * Mark requests as expired (batch job for SLA enforcement)
 * @param {number} max_age_days
 * @returns {Promise<number>} Count of expired requests
 */
async function expireStaleRequests(max_age_days)

// ============================================================================
// Request Queries
// ============================================================================

/**
 * Find requests by requester
 * @param {number} user_id
 * @param {Object} [filters] - Status, resource filters
 * @returns {Promise<Object[]>}
 */
async function findRequestsByRequester(user_id, filters = {})

/**
 * Find pending requests requiring review by user
 * @param {number} reviewer_id - Find requests for groups they admin
 * @returns {Promise<Object[]>}
 */
async function findPendingRequestsForReviewer(reviewer_id)

/**
 * Get request by ID
 * @param {string} request_id
 * @returns {Promise<Object|null>}
 */
async function findRequestById(request_id)

/**
 * Check for duplicate active requests
 * @param {number} requester_id
 * @param {string} resource_id
 * @param {string[]} actions
 * @returns {Promise<Object|null>} Existing active request if found
 */
async function findDuplicateRequest(requester_id, resource_id, actions)

/**
 * Get renewal context (previous grants and decisions)
 * @param {number} requester_id
 * @param {string} resource_id
 * @returns {Promise<{grants: Object[], requests: Object[]}>}
 */
async function getRenewalContext(requester_id, resource_id)
```

### api/src/services/authorization.js

```javascript
/**
 * Authorization Service
 * Core ABAC evaluation engine
 */

// ============================================================================
// Subject Attribute Resolution
// ============================================================================

/**
 * Resolve all authorization-relevant attributes for a user
 * @param {number} user_id
 * @returns {Promise<Object>} Subject attributes
 * @returns {number} .id
 * @returns {string[]} .groupIds - All groups (transitive)
 * @returns {string[]} .adminGroupIds - Groups where user is admin
 * @returns {boolean} .isPlatformAdmin - Role-based check
 */
async function resolveSubjectAttributes(user_id)

/**
 * Resolve resource attributes
 * @param {string} resource_type - 'DATASET' or 'COLLECTION'
 * @param {string} resource_id
 * @returns {Promise<Object>} Resource attributes
 */
async function resolveResourceAttributes(resource_type, resource_id)

// ============================================================================
// Authorization Checks (ABAC Rules)
// ============================================================================

/**
 * Check if user can perform action on dataset (consumption)
 * Implements rules from section 4.1 of design doc
 * @param {number} user_id
 * @param {number} dataset_id
 * @param {string} action - GRANT_ACCESS_TYPE enum value
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function authorizeDatasetConsumption(user_id, dataset_id, action)

/**
 * Check if user can perform governance action on dataset
 * Implements rules from section 4.2
 * @param {number} user_id
 * @param {number} dataset_id
 * @param {string} action - 'edit_metadata', 'archive', 'grant_access', etc.
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function authorizeDatasetGovernance(user_id, dataset_id, action)

/**
 * Check if user can view dataset governance metadata (oversight)
 * Implements section 4.3
 * @param {number} user_id
 * @param {number} dataset_id
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function authorizeDatasetOversight(user_id, dataset_id)

/**
 * Check collection governance authority
 * @param {number} user_id
 * @param {string} collection_id
 * @param {string} action
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function authorizeCollectionGovernance(user_id, collection_id, action)

/**
 * Check group action authority
 * @param {number} user_id
 * @param {string} group_id
 * @param {string} action - 'view_members', 'edit_metadata', 'add_member', etc.
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function authorizeGroupAction(user_id, group_id, action)

// ============================================================================
// Access Explanation
// ============================================================================

/**
 * Explain why user can/cannot access a dataset
 * Returns all applicable grants and ownership paths
 * @param {number} user_id
 * @param {number} dataset_id
 * @param {string} action
 * @returns {Promise<Object>} Detailed explanation
 */
async function explainDatasetAccess(user_id, dataset_id, action)

/**
 * List all datasets a user can access with a given action
 * @param {number} user_id
 * @param {string} action
 * @returns {Promise<number[]>} Dataset IDs
 */
async function listAccessibleDatasets(user_id, action)

/**
 * Check if user can create dataset with given ownership
 * Implements contributor rules from section 5.4
 * @param {number} user_id
 * @param {string} owner_group_id
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function authorizeDatasetCreation(user_id, owner_group_id)
```

### api/src/services/auditLog.js

```javascript
/**
 * Audit Log Service
 * Records authorization events for compliance
 */

/**
 * Log an authorization event
 * @param {Object} event
 * @param {string} event.event_type - AUTH_EVENT_TYPE enum
 * @param {number} [event.actor_id]
 * @param {string} event.target_type
 * @param {string} event.target_id
 * @param {string} [event.action]
 * @param {Object} [event.metadata]
 * @returns {Promise<Object>} Audit record
 */
async function logAuthEvent(event)

/**
 * Log an access check (for detailed auditing)
 * @param {number} user_id
 * @param {string} resource_type
 * @param {string} resource_id
 * @param {string} action
 * @param {boolean} decision
 * @param {string} reason
 * @returns {Promise<Object>}
 */
async function logAccessCheck(user_id, resource_type, resource_id, action, decision, reason)

/**
 * Query audit logs
 * @param {Object} filters
 * @param {string} [filters.event_type]
 * @param {number} [filters.actor_id]
 * @param {string} [filters.target_id]
 * @param {Date} [filters.start_date]
 * @param {Date} [filters.end_date]
 * @returns {Promise<Object[]>}
 */
async function queryAuditLogs(filters)

/**
 * Get audit trail for a specific resource
 * @param {string} target_type
 * @param {string} target_id
 * @returns {Promise<Object[]>} Chronological audit trail
 */
async function getResourceAuditTrail(target_type, target_id)
```

---

## 3. Route Layer Function Declarations

### api/src/routes/groups.js

```javascript
/**
 * Groups Routes
 * RESTful API for group management
 */

// GET /api/groups
// List all groups (filtered by user permissions)
router.get('/')

// POST /api/groups
// Create a new group
router.post('/')

// GET /api/groups/:id
// Get group details
router.get('/:id')

// PATCH /api/groups/:id
// Update group metadata
router.patch('/:id')

// DELETE /api/groups/:id
// Archive a group
router.delete('/:id')

// GET /api/groups/:id/members
// List group members
router.get('/:id/members')

// POST /api/groups/:id/members
// Add member to group
router.post('/:id/members')

// DELETE /api/groups/:id/members/:userId
// Remove member from group
router.delete('/:id/members/:userId')

// GET /api/groups/:id/admins
// List group admins
router.get('/:id/admins')

// POST /api/groups/:id/admins
// Add admin to group
router.post('/:id/admins')

// DELETE /api/groups/:id/admins/:userId
// Remove admin from group
router.delete('/:id/admins/:userId')

// GET /api/groups/:id/ancestors
// Get ancestor groups (hierarchy upward)
router.get('/:id/ancestors')

// GET /api/groups/:id/descendants
// Get descendant groups (hierarchy downward)
router.get('/:id/descendants')

// POST /api/groups/:id/reparent
// Move group to new parent
// router.post('/:id/reparent') - Don't implement until we have a use case for it, as it's complex and not currently needed

// GET /api/groups/:id/datasets
// List datasets owned by group
router.get('/:id/datasets')

// GET /api/groups/:id/collections
// List collections owned by group
router.get('/:id/collections')
```

### api/src/routes/collections.js

```javascript
/**
 * Collections Routes
 */

// GET /api/collections
router.get('/')

// POST /api/collections
router.post('/')

// GET /api/collections/:id
router.get('/:id')

// PATCH /api/collections/:id
router.patch('/:id')

// DELETE /api/collections/:id
router.delete('/:id')

// GET /api/collections/:id/datasets
router.get('/:id/datasets')

// POST /api/collections/:id/datasets
// Add dataset(s) to collection
router.post('/:id/datasets')

// DELETE /api/collections/:id/datasets/:datasetId
router.delete('/:id/datasets/:datasetId')

// POST /api/collections/:id/transfer-ownership
router.post('/:id/transfer-ownership')
```

### api/src/routes/grants.js

```javascript
/**
 * Grants Routes
 */

// GET /api/grants
// List grants (filtered by user authority)
router.get('/')

// POST /api/grants
// Create a grant
router.post('/')

// GET /api/grants/:id
router.get('/:id')

// DELETE /api/grants/:id
// Revoke a grant
router.delete('/:id')

// GET /api/grants/subject/:subjectType/:subjectId
// List grants for a subject
router.get('/subject/:subjectType/:subjectId')

// GET /api/grants/resource/:resourceType/:resourceId
// List grants for a resource
router.get('/resource/:resourceType/:resourceId')
```

### api/src/routes/access-requests.js

```javascript
/**
 * Access Requests Routes
 */

// GET /api/access-requests
// List user's requests
router.get('/')

// POST /api/access-requests
// Create new request
router.post('/')

// GET /api/access-requests/:id
router.get('/:id')

// POST /api/access-requests/:id/submit
router.post('/:id/submit')

// POST /api/access-requests/:id/approve
router.post('/:id/approve')

// POST /api/access-requests/:id/reject
router.post('/:id/reject')

// POST /api/access-requests/:id/withdraw
router.post('/:id/withdraw')

// GET /api/access-requests/pending-review
// Requests requiring user's review
router.get('/pending-review')

// GET /api/access-requests/renewal-context/:resourceId
// Get context for renewal
router.get('/renewal-context/:resourceId')
```

### api/src/routes/datasets.js (extensions)

```javascript
/**
 * Extend existing datasets routes with authorization endpoints
 */

// POST /api/datasets/:id/transfer-ownership
router.post('/:id/transfer-ownership')

// PATCH /api/datasets/:id/visibility
router.patch('/:id/visibility')

// GET /api/datasets/:id/access-explanation
// Explain why current user can/cannot access
router.get('/:id/access-explanation')

// GET /api/datasets/:id/grants
// List active grants for dataset
router.get('/:id/grants')

// GET /api/datasets/:id/access-requests
// List access requests for dataset
router.get('/:id/access-requests')
```

---

## 4. Policy Layer

### api/src/authorization/policies/dataset.js

```javascript
/**
 * Dataset Authorization Policies
 * Implements ABAC rules from design doc section 4
 */

const meta = {
  model: 'dataset',
  description: 'Dataset consumption and governance policies'
}

const actions = {
  /**
   * Consumption actions (grant-based)
   */
  view_metadata: async (user, dataset, context) => { /* Rule 4.1 */ },
  view_sensitive_metadata: async (user, dataset, context) => { /* Rule 4.1 */ },
  read_data: async (user, dataset, context) => { /* Rule 4.1 */ },
  download: async (user, dataset, context) => { /* Rule 4.1 */ },
  compute: async (user, dataset, context) => { /* Rule 4.1 */ },
  
  /**
   * Governance actions (ownership-based)
   */
  edit_metadata: async (user, dataset, context) => { /* Rule 4.2 */ },
  archive: async (user, dataset, context) => { /* Rule 4.2 */ },
  delete: async (user, dataset, context) => { /* Rule 4.2 */ },
  // transfer_ownership: async (user, dataset, context) => { /* Rule 4.2 - dual authority */ }, - Don't implement until we have a use case for it, as it's complex and not currently needed
  grant_access: async (user, dataset, context) => { /* Rule 4.2 */ },
  revoke_access: async (user, dataset, context) => { /* Rule 4.2 */ },
  edit_visibility_preset: async (user, dataset, context) => { /* Rule 4.2 */ },
  
  /**
   * Oversight (read-only governance)
   */
  view_governance_metadata: async (user, dataset, context) => { /* Rule 4.3 */ }
}

module.exports = { meta, actions }
```

### api/src/authorization/policies/collection.js

```javascript
/**
 * Collection Authorization Policies
 */

const meta = {
  model: 'collection',
  description: 'Collection governance policies'
}

const actions = {
  view_metadata: async (user, collection, context) => {},
  edit_metadata: async (user, collection, context) => {},
  add_dataset: async (user, collection, context) => { /* Check ownership match */ },
  remove_dataset: async (user, collection, context) => {},
  delete: async (user, collection, context) => {},
  // transfer_ownership: async (user, collection, context) => {}, - Don't implement until we have a use case for it, as it's complex and not currently needed
  grant_access: async (user, collection, context) => {},
  revoke_access: async (user, collection, context) => {},
  view_governance_metadata: async (user, collection, context) => {}
}

module.exports = { meta, actions }
```

### api/src/authorization/policies/group.js

```javascript
/**
 * Group Authorization Policies
 */

const meta = {
  model: 'group',
  description: 'Group structural and membership policies'
}

const actions = {
  // Lifecycle
  create: async (user, group, context) => {},
  archive: async (user, group, context) => {},
  // reparent: async (user, group, context) => { /* Dual authority check */ }, - Don't implement until we have a use case for it, as it's complex and not currently needed
  delete: async (user, group, context) => {},
  
  // Metadata
  view_metadata: async (user, group, context) => {},
  edit_metadata: async (user, group, context) => {},
  
  // Membership
  view_members: async (user, group, context) => { /* Admin or oversight */ },
  add_member: async (user, group, context) => { /* Local admin only */ },
  remove_member: async (user, group, context) => { /* Local admin only */ },
  edit_member_role: async (user, group, context) => {},
  
  // Admin
  add_admin: async (user, group, context) => {},
  remove_admin: async (user, group, context) => {},
  
  // Oversight
  view_governance_metadata: async (user, group, context) => {}
}

module.exports = { meta, actions }
```

---

## 5. Middleware Extensions

### api/src/middleware/abac.js (extensions)

```javascript
/**
 * Extend existing ABAC middleware with grant evaluation
 */

/**
 * Authorize dataset action using new authorization service
 * @param {string} action - Dataset action to authorize
 * @returns {Function} Express middleware
 */
function authorizeDataset(action)

/**
 * Authorize collection action
 * @param {string} action
 * @returns {Function}
 */
function authorizeCollection(action)

/**
 * Authorize group action
 * @param {string} action
 * @returns {Function}
 */
function authorizeGroup(action)

/**
 * Require user to be member of group (direct or transitive)
 * @param {Function} groupIdExtractor - Extracts group ID from req
 * @returns {Function}
 */
function requireGroupMembership(groupIdExtractor)

/**
 * Require user to be admin of group
 * @param {Function} groupIdExtractor
 * @returns {Function}
 */
function requireGroupAdmin(groupIdExtractor)

/**
 * Attach grant explanation to response
 * @returns {Function}
 */
function attachAccessExplanation()
```

---

## 6. Migration Strategy

### Initial Migration

```
// Migration: 001_add_groups_and_authorization

1. Create groups table
2. Create group_closure table with indexes
3. Create group_user table
4. Create group_admin table
5. Create collection table
6. Create collection_dataset table
7. Create grant table with compound indexes
8. Create access_request table
9. Create authorization_audit table
10. Add owner_group_id to dataset table
11. Add visibility enum to dataset table
12. Add group relations to user table
13. Create built-in "Everyone" system group
14. Create migration helpers for existing 
15. Create scripts for default groups, group types, and initial data migration
```

### Data Migration Steps

```javascript
// scripts/migrate-existing-data.js

/**
 * Create default institutional group structure
 */
async function createDefaultGroups()

/**
 * Migrate existing project-based access to group-based
 */
async function migrateProjectsToGroups()

/**
 * Assign existing datasets to groups based on project ownership
 */
async function assignDatasetOwnership()

/**
 * Convert existing visibility/access patterns to grants
 */
async function createInitialGrants()
```

### Seed Data

```javascript
// prisma/seed_data/groups.json
// Define initial group structure

// prisma/seed_data/system_groups.json
// Define "Everyone" and other system groups
```

---

## 7. File Structure Summary

```
api/
├── prisma/
│   ├── schema.prisma (EXTENDED with new models)
│   ├── migrations/
│   │   └── 001_add_groups_and_authorization/
│   └── seed_data/
│       ├── groups.json
│       └── system_groups.json
│
├── src/
│   ├── services/
│   │   ├── group.js (NEW - 500+ lines)
│   │   ├── collection.js (NEW - 300+ lines)
│   │   ├── grant.js (NEW - 400+ lines)
│   │   ├── accessRequest.js (NEW - 350+ lines)
│   │   ├── authorization.js (NEW - 600+ lines)
│   │   ├── auditLog.js (NEW - 200+ lines)
│   │   ├── dataset.js (EXTEND with ownership/visibility)
│   │   └── user.js (EXTEND with group queries)
│   │
│   ├── routes/
│   │   ├── groups.js (NEW - RESTful group endpoints)
│   │   ├── collections.js (NEW - RESTful collection endpoints)
│   │   ├── grants.js (NEW - Grant management endpoints)
│   │   ├── access-requests.js (NEW - Request workflow endpoints)
│   │   ├── datasets.js (EXTEND with auth endpoints)
│   │   └── index.js (EXTEND - mount new routes)
│   │
│   ├── authorization/
│   │   └── policies/
│   │       ├── dataset.js (NEW - ABAC rules)
│   │       ├── collection.js (NEW - ABAC rules)
│   │       ├── group.js (NEW - ABAC rules)
│   │       └── index.js (EXTEND - register new policies)
│   │
│   ├── middleware/
│   │   ├── abac.js (EXTEND with grant evaluation)
│   │   └── validators.js (EXTEND with new schemas)
│   │
│   └── scripts/
│       ├── migrate-existing-data.js (NEW - one-time migration)
│       ├── expire-grants.js (NEW - batch job)
│       └── expire-requests.js (NEW - batch job)
│
└── tests/
    ├── services/
    │   ├── group.test.js (NEW)
    │   ├── collection.test.js (NEW)
    │   ├── grant.test.js (NEW)
    │   ├── accessRequest.test.js (NEW)
    │   └── authorization.test.js (NEW)
    │
    └── routes/
        ├── groups.test.js (NEW)
        ├── collections.test.js (NEW)
        ├── grants.test.js (NEW)
        └── access-requests.test.js (NEW)
```

---

This implementation spec provides the complete data model, service layer structure, route definitions, and policy framework needed to implement the hierarchical groups and access control system. All function signatures follow existing codebase patterns while introducing the new authorization primitives defined in the design documents.


Feature out of scope for initial phase:
- transfer ownership of datasets and collections
- group reparenting
- access request renewal


SQL

```sql
-- create "Everyone" system group
INSERT INTO "group" (id, name, slug, description, allow_user_contributions) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Everyone', 'everyone', 'System principal representing all authenticated users. Cannot be deleted or modified.', false);

-- Prevent deletion of "Everyone" group
CREATE OR REPLACE RULE prevent_everyone_delete AS
  ON DELETE TO "group"
  WHERE OLD.id = '00000000-0000-0000-0000-000000000000'
  DO INSTEAD NOTHING;

-- Prevent members from being added to "Everyone" group
ALTER TABLE group_user 
  ADD CONSTRAINT no_everyone_members 
  CHECK (group_id != '00000000-0000-0000-0000-000000000000');

-- Prevent hierarchy relationships involving "Everyone" group
ALTER TABLE group_closure 
  ADD CONSTRAINT no_everyone_hierarchy 
  CHECK (
    ancestor_id != '00000000-0000-0000-0000-000000000000' 
    AND descendant_id != '00000000-0000-0000-0000-000000000000'
  );
```

Edit table authorization_audit
```
PARTITION BY RANGE (timestamp);
```

```sql
-- create monthly partitions for the next 10 years
DO $$
DECLARE
    start_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
    end_year INT := start_year + 9;
    year INT;
    month INT;
    next_month INT;
    next_year INT;
BEGIN
    FOR year IN start_year..end_year LOOP
        FOR month IN 1..12 LOOP
            next_month := month + 1;
            next_year := year;
            IF next_month > 12 THEN
                next_month := 1;
                next_year := year + 1;
            END IF;
            
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS authorization_audit_%s_%s PARTITION OF authorization_audit
                FOR VALUES FROM (''%s-%s-01 00:00:00'') TO (''%s-%s-01 00:00:00'');
            ', year, LPAD(month::TEXT, 2, '0'), year, LPAD(month::TEXT, 2, '0'), next_year, LPAD(next_month::TEXT, 2, '0'));
        END LOOP;
    END LOOP;
END $$;

-- create default partition for old records
CREATE TABLE IF NOT EXISTS authorization_audit_default PARTITION OF authorization_audit DEFAULT;
```

```sql
CREATE OR REPLACE VIEW effective_user_groups AS
SELECT
  gu.user_id,
  gc.ancestor_id AS group_id
FROM group_user gu
-- walk up the closure table from each directly-joined group
JOIN group_closure gc
  ON gc.descendant_id = gu.group_id
-- self-rows in closure table (depth=0) cover direct membership too

--- Usage:
-- SELECT DISTINCT group_id
-- FROM effective_user_groups
-- WHERE user_id = $1;


CREATE OR REPLACE VIEW effective_user_oversight_groups AS
SELECT
  gu.user_id,
  gc.descendant_id AS group_id
FROM group_user gu
JOIN group_closure gc 
  ON gc.ancestor_id = gu.group_id -- walk DOWN the closure table from each admin group
WHERE gu.role = 'ADMIN' -- only admins have oversight
  AND gc.depth > 0; -- exclude self (you don't "oversee" your own group, you administer it)

-- Usage:
-- groups U has oversight over (strict descendants of groups U admins)
-- SELECT DISTINCT group_id
-- FROM effective_user_oversight_groups
-- WHERE user_id = $1;

-- valid_from is inclusive, valid_until is exclusive
-- don't use valid_until >= now() elsewhere
CREATE OR REPLACE VIEW valid_grants AS
SELECT *
FROM "grant" g
WHERE g.valid_from <= now()
  AND (g.valid_until IS NULL OR g.valid_until > now())
  AND g.revoked_at IS NULL;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- For the same (subject_type, subject_id, resource_type, resource_id, access_type_id) tuple, there must never exist two non-revoked grants whose validity intervals overlap.
-- validity period checks: left inclusive, right exclusive
-- [10:00, 11:00) and [11:00, 12:00) do NOT overlap

ALTER TABLE "grant"
ADD COLUMN valid_period tsrange
GENERATED ALWAYS AS (
  tsrange(valid_from, valid_until, '[)')
) STORED;  


ALTER TABLE "grant"
ADD CONSTRAINT grant_no_overlap
EXCLUDE USING gist (
  subject_type WITH =,
  subject_id WITH =,
  resource_type WITH =,
  resource_id WITH =,
  access_type_id WITH =,
  valid_period WITH &&
)
WHERE (revoked_at IS null);
```