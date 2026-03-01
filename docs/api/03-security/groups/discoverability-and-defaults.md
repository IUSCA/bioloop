```
///////////////////////////////////////////////////////////////////////////////
// CORE HELPERS
///////////////////////////////////////////////////////////////////////////////

function now() -> Timestamp

function isPlatformAdmin(user) -> Boolean

function isArchived(group) -> Boolean
  return group.status == "archived"

function userDirectGroups(user) -> Set<GroupId>

function ancestorGroups(groupId) -> Set<GroupId>
  // via closure table where descendant = groupId

function descendantGroups(groupId) -> Set<GroupId>
  // via closure table where ancestor = groupId

function userAllGroups(user) -> Set<GroupId>
  result = {}
  for g in userDirectGroups(user):
    result += ancestorGroups(g)
  return result

function userAdminGroups(user) -> Set<GroupId>

function userOversightGroups(user) -> Set<GroupId>
  result = {}
  for g in userAdminGroups(user):
    result += descendantGroups(g)
  return result

function activeGrantsFor(subjectType, subjectId, resourceType, resourceId, action) -> Set<Grant>
  return grants where:
    grant.subjectType == subjectType AND
    grant.subjectId == subjectId AND
    grant.resourceType == resourceType AND
    grant.resourceId == resourceId AND
    grant.accessType == action AND
    grant.status == "active" AND
    grant.validFrom <= now() AND
    (grant.validUntil IS NULL OR grant.validUntil > now())

function userHasGrant(user, resourceType, resourceId, action) -> Boolean
  // direct grant
  if activeGrantsFor("User", user.id, resourceType, resourceId, action) not empty:
    return true

  // group grants
  for g in userAllGroups(user):
    if activeGrantsFor("Group", g, resourceType, resourceId, action) not empty:
      return true

  // everyone principal
  if activeGrantsFor("Everyone", "*", resourceType, resourceId, action) not empty:
    return true

  return false

///////////////////////////////////////////////////////////////////////////////
// DISCOVERABILITY RULES
///////////////////////////////////////////////////////////////////////////////

//////////////////////////////
// GROUP DISCOVERABILITY
//////////////////////////////

function canViewGroupMetadata(user, group) -> Boolean
  if isPlatformAdmin(user):
    return true

  if group.id in userAllGroups(user):
    return true

  if group.id in userOversightGroups(user):
    return true

  if group.visibility == "institution_discoverable":
    return true

  return false

function searchableGroups(user) -> Set<Group>
  return all groups where canViewGroupMetadata(user, group) == true

//////////////////////////////
// COLLECTION DISCOVERABILITY
//////////////////////////////

function canViewCollectionMetadata(user, collection) -> Boolean
  if isPlatformAdmin(user):
    return true

  if collection.ownerGroupId in userAllGroups(user):
    return true

  if userHasGrant(user, "Collection", collection.id, "view_metadata"):
    return true

  return false

function searchableCollections(user) -> Set<Collection>
  return all collections where canViewCollectionMetadata(user, collection) == true

//////////////////////////////
// DATASET DISCOVERABILITY
//////////////////////////////

function canViewDatasetMetadata(user, dataset) -> Boolean
  if isPlatformAdmin(user):
    return true

  if dataset.ownerGroupId in userAllGroups(user):
    return true

  if userHasGrant(user, "Dataset", dataset.id, "view_metadata"):
    return true

  if dataset.visibilityPreset == "INSTITUTION_DISCOVERABLE":
    if userHasGrant(user, "Dataset", dataset.id, "view_metadata"):
      return true

  return false

function searchableDatasets(user) -> Set<Dataset>
  return all datasets where canViewDatasetMetadata(user, dataset) == true

///////////////////////////////////////////////////////////////////////////////
// DEFAULT ACCESS TEMPLATES (EMITTED AS GRANTS)
///////////////////////////////////////////////////////////////////////////////

//////////////////////////////
// GROUP CREATION
//////////////////////////////

function onGroupCreated(group, creator)
  addAdmin(group, creator)
  // implicit: admins manage, members view metadata (policy-derived)

//////////////////////////////
// DATASET CREATION (LAB TEMPLATE)
//////////////////////////////

function onDatasetCreated(dataset, creator, ownerGroup)

  // creator full governance via admin check if applicable

  if ownerGroup.default_member_data_access == true:
    createGrant(
      subjectType="Group",
      subjectId=ownerGroup.id,
      resourceType="Dataset",
      resourceId=dataset.id,
      accessType="read_data"
    )

  createGrant(
    subjectType="Group",
    subjectId=ownerGroup.id,
    resourceType="Dataset",
    resourceId=dataset.id,
    accessType="view_metadata"
  )

//////////////////////////////
// INSTITUTION DISCOVERABLE PRESET
//////////////////////////////

function applyVisibilityPreset(dataset, preset)

  if preset == "INSTITUTION_DISCOVERABLE":
    createGrant(
      subjectType="Everyone",
      subjectId="*",
      resourceType="Dataset",
      resourceId=dataset.id,
      accessType="view_metadata"
    )

  if preset == "PUBLIC":
    createGrant(
      subjectType="Everyone",
      subjectId="*",
      resourceType="Dataset",
      resourceId=dataset.id,
      accessType="read_data"
    )

///////////////////////////////////////////////////////////////////////////////
// CONSUMPTION AUTHORIZATION
///////////////////////////////////////////////////////////////////////////////

function canReadDataset(user, dataset) -> Boolean

  if isPlatformAdmin(user):
    return true

  if dataset.ownerGroupId in userAllGroups(user):
    return true

  if userHasGrant(user, "Dataset", dataset.id, "read_data"):
    return true

  for collection in dataset.collections:
    if userHasGrant(user, "Collection", collection.id, "read_data"):
      return true

  return false

///////////////////////////////////////////////////////////////////////////////
// GOVERNANCE AUTHORIZATION (STRUCTURE-BASED)
///////////////////////////////////////////////////////////////////////////////

function canAdminDataset(user, dataset) -> Boolean
  if isPlatformAdmin(user):
    return true

  if dataset.ownerGroupId in userAdminGroups(user):
    return true

  return false

function canGrantAccess(user, dataset) -> Boolean
  if isArchived(dataset.ownerGroup):
    return false

  return canAdminDataset(user, dataset)

///////////////////////////////////////////////////////////////////////////////
// ARCHIVED GROUP ENFORCEMENT
///////////////////////////////////////////////////////////////////////////////

function canModifyGroup(user, group, action) -> Boolean

  if isPlatformAdmin(user):
    return true

  if isArchived(group):
    return false

  if action in {"add_member", "remove_member", "edit_metadata"}:
    return group.id in userAdminGroups(user)

  return false

///////////////////////////////////////////////////////////////////////////////
// SEARCH PIPELINE SAFETY
///////////////////////////////////////////////////////////////////////////////

function searchDatasets(user, query) -> Set<Dataset>

  candidates = fullTextSearch(query)

  result = {}
  for d in candidates:
    if canViewDatasetMetadata(user, d):
      result += d

  return result
```