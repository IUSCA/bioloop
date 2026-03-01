---
title: Data Sharing
---

# Granular Access Control for Data Sharing

## Behavioral Requirements

### 1. **Restrict Access Based on File Type**

> “Any dataset tagged as `restricted-genetics` must never expose `.bam` files.”

**Implementation**:

* Create a dataset collection for datasets tagged `restricted-genetics`.
* Define a file access rule with a filter like `{ "filetype": "bam" }` and `is_allow = false`.
* Attach the rule to that dataset collection.

### 2. **Allow Only Certain Users to View Specific File Types**

> “Only the genomics team (user collection `genomics`) should be able to view `.vcf` files in sensitive collections.”

**Implementation**:

* Define a rule with filter `{ "filetype": "vcf" }` and `is_allow = true`, `applies_to = 'view'`.
* Attach it to the `genomics` user collection + a `dataset_collection` that contains the sensitive datasets.


### 3. **Block Download but Allow Preview**

> “Users in the neuroscience project can view `.nii.gz` files but not download them.”

**Implementation**:

* Project defines both datasets and users.
* Attach two rules to the project:

  * Allow `view` of files with filter `{ "filetype": "nii.gz" }`
  * Deny `download` of same filter

### 4. **Restrict Files by Filename Patterns**

> “In the Alzheimer’s cohort access request, exclude files named `*raw_scan*` from view or download.”

**Implementation**:

* Create a rule with filter `{ "name_pattern": "*raw_scan*" }`, `is_allow = false`.
* Attach to the cohort access request ID.


### 5. **Default Open Access with Specific Deny Rule**

> “By default, datasets in the OpenData collection are fully accessible, except `.zip` files are not downloadable.”

**Implementation**:

* No default rules = full access.
* Add one rule to the dataset collection: filter `{ "filetype": "zip" }`, `is_allow = false`, `applies_to = 'download'`.


### 6. **Allow Access Only to Metadata Files**

> “In a specific cohort access request, a user is only allowed to access `.json` files describing the data but not actual data files.”

**Implementation**:

* Define a rule with filter `{ "filetype": "json" }`, `is_allow = true`.
* Attach to the cohort access request.
* Implicitly, no allow rules for other files = not visible/downloadable.

## Functional Requirements



### Rule Evaluation

* The system must evaluate access at the `file` level during listing and download requests.
* Rules are evaluated in **context order**: project → cohort request → dataset collection → user+dataset collection.
* Deny rules (`is_allow = false`) must override allow rules when conflicts exist.



### Filters

* Filters must support:

  * File type (`filetype`)
  * Filename pattern matching (`name_pattern`, glob or regex)
  * Path or directory filtering (`path_pattern`)
  * Structured file metadata fields (e.g., `metadata.age`, `metadata.region`)
* Filters are stored as JSON and evaluated in deterministic, index-aware manner (e.g., via compiled predicates or query conditions).



### Scope Enforcement

* A rule applies only when its scope (project, cohort, dataset collection, or user+dataset collection) includes the user and the dataset in question.
* If no rules apply to a dataset, the dataset’s files are fully accessible to authorized users of that dataset.




### Administration

* Admins can:

  * Create and edit file access rules.
  * Assign scopes to rules via defined scope tables.
  * Manage dataset collections and user collections.
* System must log rule application events (e.g., filtered files) for audit purposes.



### Defaults & Precedence

* If no rule applies: **allow full access**.
* Conflicting rules:

  * Deny > Allow
  * More specific scopes override broader scopes (e.g., project > dataset collection).
* Multiple scopes can apply simultaneously; system must aggregate all applicable rules.

## User Collections

```prisma
model collection {
  id          Int                @id @default(autoincrement())
  name        String
  criteria    Json?              // Optional dynamic query definition (e.g., tag-based)
  is_dynamic  Boolean            @default(false)
  target_type CollectionTargetType

  // audit fields
}

model user_collection {
  user_id Int
  collection_id Int
  user          user        @relation(fields: [user_id], references: [id], onDelete: Cascade)
  collection    collection  @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  @@id([user_id, collection_id])
}

enum CollectionTargetType {
  user
  dataset
  // add more types as needed
}
```

### Recompute Triggers

| Event                            | Should trigger recompute? | Reason                                      |
| -------------------------------- | ------------------------- | ------------------------------------------- |
| Collection is created (with criteria) | ✅                         | Evaluate all users                          |
| Collection criteria is updated        | ✅                         | Evaluate all users                          |
| Collection is deleted                 | ❌                         | Cascade delete from `user_collection`       |
| **User is created**              | ✅                         | recompute only the **affected user**        |
| **User is updated**              | ✅                         | recompute only the **affected user**        |
| User is deleted                  | ❌                         | Cascade delete from `user_collection`       |


#### Implementation Strategy

* Create a function `recomputeUserCollectionMembership(userId)` that:

  * Fetches all dynamic collections
  * Applies each collection's criteria to the user
  * Updates the `user_collection` table accordingly (insert/delete as needed)
* Call it:

  * After `user.update()`
  * After `user.create()`

* **Use a DB transaction** for user creation/update only.
* **After commit**, trigger `recomputeUserCollectionMembership(userId)`:

  * In a background worker (e.g., BullMQ, temporal, SQS)
  * Or inline if recompute is guaranteed to be fast and low-risk

* Optionally, expose an admin-only endpoint like `POST /user-collections/:id/recompute`.

This gives the **correctness of isolation**, while avoiding performance penalties or complex error handling in your main transactional code path.


## Dataset Collections

```prisma
model dataset_collection {
  dataset_id Int
  collection_id Int
  dataset       dataset            @relation(fields: [dataset_id], references: [id], onDelete: Cascade)
  collection    dataset_collection @relation(fields: [collection_id], references: [id], onDelete: Cascade)
  @@id([dataset_id, collection_id])
}
```

## File Access Rules

```prisma
model file_access_rule {
  id           Int        @id @default(autoincrement())
  name         String
  applies_to   String     // 'view' | 'download'
  filters      Json       // filter spec (see below)
  is_allow     Boolean    // allow or deny (for future policy flexibility)
  created_at   DateTime   @default(now())
  updated_at   DateTime   @default(now()) @updatedAt

  // Scopes
  project_scopes             rule_scope_project[]
  cohort_scopes              rule_scope_cohort_access_request[]
  dataset_collection_scopes  rule_scope_dataset_collection[]
  user_dataset_scopes       rule_scope_user_dataset_collection[]
}

model rule_scope_project {
  project_id   String
  rule_id      Int

  @@id([project_id, rule_id])
}

model rule_scope_cohort_access_request {
  cohort_access_request_id Int
  rule_id      Int

  @@id([cohort_access_request_id, rule_id])
}

model rule_scope_dataset_collection {
  dataset_collection_id Int
  rule_id      Int

  @@id([dataset_collection_id, rule_id])
}

model rule_scope_user_dataset_collection {
  rule_id               Int
  user_collection_id              Int
  dataset_collection_id Int

  @@id([rule_id, user_collection_id, dataset_collection_id])
}

```

#### Filters example
```json
{
  "glob": {
    "includes": [".*.csv"],
    "excludes": ["*.tmp", "*.log"],
  },
  "metadata": {
    "source": "regeneron"
  }
}
```

#### Scopes
* A rule cannot be applied without dataset context. So, rules cannot be standalone or scoped to users alone.
* Rules can be scoped to:

  * Projects (e.g., `project_scopes`)
  * Cohort access requests (e.g., `cohort_scopes`)
  * Dataset collections (e.g., `dataset_collection_scopes`)
  * User collections and dataset collections (e.g., `user_dataset_scopes`)

### Application Logic

#### Check Access to a File

1. **Verify User Access to the Dataset**:
  - Confirm the user is part of the project associated with the dataset.
  - Ensure the user has approved access requests for the dataset.

2. **Retrieve Applicable Rules**:
  - Rules scoped to the project containing both the dataset and the user.
  - Rules scoped to the approved cohort access request associated with the dataset.
  - Rules associated with each user collection the user belongs to and the dataset collection the dataset is part of.
  - Rules linked to dataset collections that include the dataset.


3. **Evaluate Rules**:
  - Combine all `ALLOW` rules. If the file matches any of these rules, grant access.
  - For `DENY` rules (future implementation): deny access only if no `ALLOW` rule applies and a `DENY` rule matches the file.


## Future Requirements
- Context aware rules (e.g., IP address, time of day)
- Rule expiration (e.g., time-based access)
- Rule simulation (e.g., "what files would user X see under policy Y?")
- Rule auditing (e.g., track rule enforcement decisions in access logs)