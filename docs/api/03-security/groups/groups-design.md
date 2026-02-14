---
title: Design
---

# Hierarchical Groups, Collections, and Data Access – Unified Design

## 1. Purpose and Scope

This document defines a **foundational, future‑proof design** for hierarchical groups, dataset ownership, collections, and access control in a university or research‑group data management portal.

The goal is not to optimize for an MVP UI, but to establish **correct invariants** that can support:

* Thousands to millions of datasets
* Complex organizational hierarchies
* Delegated administration
* Auditable, explainable access decisions
* Incremental addition of workflows and compliance rules

This design explicitly incorporates all *foundational* and *anticipated* use cases previously identified and replaces earlier, narrower designs.

---

## 2. Non‑Goals

This system is **not** intended to:

* Be a general‑purpose IAM replacement
* Encode permissions as static roles
* Precompute per‑user permissions
* Conflate storage, compute, and authorization concerns

---

## 3. Core Design Principles

From first principles, the design adheres to the following constraints:

1. **Correctness before convenience** – authorization must be explainable and auditable.
2. **Read‑heavy optimization** – authorization checks dominate writes.
3. **Monotonic extensibility** – new features add attributes and policies, not new paradigms.
4. **Explicit state** – access exists because of durable facts, not implicit side effects.
5. **Separation of concerns** – hierarchy traversal, policy logic, and persistence are isolated.

---

## 4. Architectural Decisions

### 4.1 Why ABAC

ABAC was chosen because:

* Group structures are dynamic and hierarchical.
* Access rules depend on relationships, not static roles.
* RBAC would cause role explosion (e.g., LabA‑Reader, CoreB‑Admin, etc.).

ABAC policies operate on attributes such as:

* `user.groupIds`
* `dataset.ownerGroupId`
* `group.adminIds`

### 4.2 Why Closure Table

The naive adjacency‑list model (`group.parentId`) requires recursive queries for reads, which is unacceptable in a read‑heavy system.

The closure table:

* Stores all ancestor–descendant relationships explicitly.
* Enables constant‑time, indexed authorization checks.
* Makes transitive permissions trivial to evaluate.

Trade‑off accepted:

* Slower writes (group creation, reparenting).
* Faster, predictable reads (authorization checks).

This trade‑off matches the system's workload.

---

## 5. Core Concepts

### 5.1 Subjects

* **User** – authenticated human or service identity
* **Group** – container for users and administrative authority

Users may belong to multiple groups simultaneously.

---

### 5.2 Resources

* **Dataset** – atomic unit of data access
* **Collection** – container for datasets, used for scalable access management

Datasets may belong to zero or more collections.

---

### 5.3 Ownership vs Access

Ownership and access are **intentionally distinct**:

* **Ownership** defines *authority*
* **Access** defines *permission to act*

Every dataset and collection has exactly one **owning group**.

---

### 5.4 Dataset Creation and Initial Ownership Assignment

Datasets may be created through multiple pathways, each with specific ownership assignment rules.

#### Creation Pathways

1. **System-created datasets** (e.g., directory watchers)
   * Deterministic rule assigns owning group based on source location or metadata
   * No human actor involved

2. **User uploads** (normal users, group admins, or platform admins)
   * Human actor initiates creation
   * Ownership must be explicitly assigned at creation time

#### Ownership Assignment Rules

**Platform Admin Upload:**

* Must explicitly choose any group in the system
* No restrictions

**Group Admin Upload:**

* Must choose from groups they administer (local admin authority only)
* Cannot assign ownership to groups where they lack admin role

**Normal User Upload:**

Normal users act as **contributors**, not owners.

Process:

1. Determine all groups where user is a member (including transitive membership)
2. Filter to groups that allow user contributions (controlled by group attribute: `allowUserContributions`)
3. Apply selection logic:
   * If exactly one eligible group → auto-assign ownership to that group
   * If multiple eligible groups → require explicit selection from those groups
   * If zero eligible groups → reject upload

**Critical Constraints:**

* Users may **only** choose from groups where they are members
* Users may **not** choose arbitrary groups
* Users may **not** create datasets outside their governance boundary

#### Contributor vs Owner Distinction

**Uploading does not confer governance authority.**

When a normal user uploads a dataset:

* They act as a contributor to their group
* The group becomes the owner
* The group's admins retain all governance authority
* The uploader does **not** gain admin rights over the dataset
* Governance actions (grant access, revoke access, transfer ownership) still require group admin role

This aligns with common research reality:

* A PhD student uploads data on behalf of their lab
* A researcher contributes data to a shared core facility
* A technician uploads results for a grant-funded project

The owning group's admins control:

* Access grants
* Revocation
* Lifecycle management
* Metadata editing
* Ownership transfer

#### Rejected Alternative: Personal Workspace Groups

An alternative approach was considered: create an implicit "personal workspace" group per user.

**Proposed Model:**

* Each user gets an automatic group: `user:alice` → `group:alice_personal`
* User is admin of their personal group
* Personal groups exist outside the organizational hierarchy
* Datasets uploaded by users default to their personal group
* Users may later request ownership transfer to a lab/grant group (via dual consent)

This pattern mimics systems like GitHub, cloud storage providers, or notebook platforms.

**Why This Was Rejected:**

While this approach offers zero-friction uploads and a familiar mental model, it fundamentally conflicts with core design principles:

1. **Governance Boundary Explosion**
   * Creates thousands of new governance boundaries (one per user)
   * Each boundary requires independent policy enforcement
   * Dramatically increases authorization complexity

2. **Lifecycle Management Burden**
   * What happens when a user leaves the institution?
   * Who inherits orphaned datasets?
   * How long do personal groups persist?
   * Who audits activity in personal workspaces?

3. **Compliance and Oversight Gaps**
   * Personal groups complicate institutional oversight
   * Do they appear in compliance reports?
   * Can users grant external access from personal groups?
   * How do institutional data retention policies apply?

4. **Hierarchical Ambiguity**
   * Do personal groups inherit from institutional hierarchy?
   * Are they visible to Center/Core admins?
   * Do platform-wide policies apply?
   * How do they interact with organizational restructuring?

5. **Violation of Core Principles**
   * Violates KISS (Keep It Simple, Stupid)
   * Increases system entropy
   * Expands surface area for policy enforcement
   * Creates implicit governance authority outside organizational structure
   * Conflicts with the principle that governance topology must align with organizational structure

**Fundamental Misalignment:**

This system is designed for **institutional data governance**, not personal workspaces.

Research data belongs to grants, labs, cores, and centers—not individuals.

The contributor model correctly represents the reality:

* Researchers contribute to their institution
* Governance authority remains with organizational units
* Ownership follows funding and organizational structure
* Compliance and oversight follow institutional hierarchy

**If Personal Workspaces Are Required:**

Model them explicitly:

* Create a real group: "Personal Workspaces"
* Place it in the hierarchy under an appropriate parent
* Define explicit lifecycle and retention policies
* Assign institutional oversight
* Make it opt-in, not implicit

This keeps governance boundaries explicit and auditable.

#### Auditability

All dataset creation events record:

* Creator identity
* Owning group assignment
* Authority basis (admin role, membership, system rule)
* Timestamp
* Source pathway

---

### 5.5 System Principal: "Everyone"

#### Definition

A built-in, non-editable principal representing all authenticated users.

Characteristics:

* Not a real group in the hierarchy.
* Cannot have admins.
* Cannot contain sub-groups.
* Exists solely as a grant target.

#### Purpose

Enables explicit representation of global access.

Example:

* Public dataset → Grant(read_data) to Everyone.
* Discoverable dataset → Grant(view_metadata) to Everyone.

#### Why This Matters

This preserves a single source of truth:

Access exists only if a grant exists.

Even “public” access is now durable, auditable, and revocable.

---

## 6. Hierarchical Groups

### 6.1 Group Hierarchy

Groups may be nested arbitrarily:

* Center → Core → Lab → Sub‑Lab

Hierarchy semantics:

* Membership is **transitive upward**
* Administrative authority is **local only**
* Oversight visibility is **transitive downward**

* If G1 is a parent of G2, then:

  * All members of G2 are also members of G1
  * Admins of G1 have **oversight visibility** over G2 (read-only governance observability)
  * Admins of G1 do **NOT** have governance authority over G2

* If an access grant targets Group G, then: All users who are members of G or its descendant groups receive the grant.

#### Critical Distinction: Organizational Hierarchy vs Governance Authority

The group hierarchy represents two orthogonal concerns:

1. **Organizational structure** (reporting, visibility)
2. **Governance authority** (who controls access)

These overlap but are **not the same**.

* Hierarchy determines membership propagation and oversight visibility
* Ownership determines governance control
* Governance authority never derives from hierarchy alone

This separation ensures that organizational restructuring (reparenting) does not accidentally shift data governance authority.


---

### 6.2 Closure Table

To support transitive queries efficiently, group ancestry is materialized using a **closure table**.

**GroupClosure**

* ancestorGroupId
* descendantGroupId
* depth

Invariant:

* Every group has a self‑row with depth = 0

Hierarchy writes are rare; authorization reads are constant‑time and indexed.

### 6.3 Oversight Visibility

**Oversight** is a derived, read-only governance capability.

#### Definition

A user has `group.oversight_view` over Group G if:

* User is admin of any ancestor of G (via closure table)
* OR user is platform admin

This is a **pure ABAC rule** with no persistence required.

#### What Oversight Allows (Read-Only)

* View group metadata
* View descendant groups
* View datasets owned by descendant groups
* View grants on those datasets
* View membership of descendant groups
* Run audit reports

#### What Oversight Does NOT Allow

* Grant access
* Revoke access
* Edit dataset metadata
* Transfer ownership
* Edit collection membership
* Modify group membership
* Change visibility presets

Oversight provides **read-only governance observability**, not delegated control.

#### Reparenting Safety

When a group is reparented:

* Old ancestor admins lose oversight visibility
* New ancestor admins gain oversight visibility
* **No governance authority changes**
* **No dataset grant authority changes**

This ensures organizational restructuring does not accidentally shift data control.

---

## 7. Collections

Collections are **first‑class authorization containers**, symmetric to groups.

* Groups contain users
* Collections contain datasets

Collections exist to:

* Avoid dataset‑by‑dataset grants
* Enable coherent access review
* Support large‑scale governance

Collections may optionally be hierarchical using the same closure‑table pattern.

### 7.1 Collection Membership Control

Collections **are** authorization containers.

Adding or removing a dataset from a collection is not a casual metadata edit—it is a **high‑impact authorization operation** that changes effective access for all subjects with grants to that collection.

Therefore:

* Adding a dataset to a collection requires the same authority as granting direct access to that dataset
* Only users with admin authority over the dataset's owning group may modify collection membership
* Collection edits emit audit events with full provenance (actor, authority, affected grants)
* Effective access changes are traceable to specific collection membership changes

Invariant:

* Collection membership mutations are subject to the same authorization and auditing standards as grant creation.
* No group may indirectly grant access to data it does not own.

This ensures that collections remain **explainable authorization primitives**, not implicit side channels.


```
ALLOW collection.addDataset IF:

U ∈ (collection.ownerGroup)
AND dataset.ownerGroup == collection.ownerGroup
```

```
ALLOW collection.removeDataset IF:

U ∈ (collection.ownerGroup)
AND dataset.ownerGroup == collection.ownerGroup
```


---

## 8. Grants: The Core Authorization Primitive

### 8.1 Grant Definition

A **Grant** is a durable, auditable fact that confers access.

**Grant**

* id
* subjectType (User | Group)
* subjectId
* resourceType (Dataset | Collection)
* resourceId
* accessType (read, compute, download, admin, etc.)
* grantedBy (actor identity)
* grantedViaGroup (authority)
* validFrom
* validUntil (nullable)
* status (active | revoked | expired)

Grants are **never deleted**.

---

### 8.2 Why Grants Are Foundational

All non‑trivial use cases depend on grants:

* Revocation
* Expiration
* Access explanation
* Auditing
* Delegation
* Approval workflows

Implicit permissions are explicitly forbidden.

---

### 8.3 Grants are atomic

If a data steward want to give a subject read and download access, two separate grants must be created:
1. Grant(subject, resource, read)
2. Grant(subject, resource, download)

Reasoning:
* Each grant is a single, atomic fact that can be audited, explained, and revoked independently.
* This avoids combinatorial explosion of access types and simplifies policy logic.

### 8.4 Critical Constraint: Grants Are Only For Consumption Actions

Grants represent **consumption rights**, not **governance authority**.

**Consumption Actions** (Grant-Based):

* `dataset.view_metadata`
* `dataset.view_sensitive_metadata`
* `dataset.read_data`
* `dataset.download`
* `dataset.compute`
* `collection.view_metadata`
* `collection.request_access`

These actions:

* Change who can use data
* Are revocable
* Are delegatable
* Are frequently modified
* Require explicit audit trails

**Governance Actions** (Structure-Based, NOT Grant-Based):

* `dataset.edit`
* `dataset.admin`
* `dataset.transfer_ownership`
* `dataset.grant_access`
* `dataset.revoke_access`
* `collection.edit`
* `collection.manage_membership`

These actions:

* Change who controls access
* Derive from ownership + group admin role
* Are enforced via ABAC rules
* Follow organizational hierarchy
* Require **no grant rows**

**Invariant**:

> Ownership defines *who may control access*.
>
> Grants define *who may consume data*.

This separation prevents:

* Circular administrative authority
* Cross-group governance complexity
* Blurred ownership boundaries
* Administrative authority existing outside organizational structure

**Why Keep Admin Actions Outside Grants**:

1. Governance topology must align with organizational structure
2. Administrative delegation would explode complexity
3. Ownership-based authority is deterministic and auditable
4. No risk of orphaned administrative grants after org changes

### 8.5 Visibility Presets as Grant Templates

Visibility is not evaluated directly in authorization.

Instead:

`visibilityPreset` → emits deterministic grant templates.

Examples:

PUBLIC:

* Grant(read_data) → Everyone

DISCOVERABLE:

* Grant(view_metadata) → Everyone

GROUP_VISIBLE:

* Grant(read_data) → owningGroupId

STEWARD_ONLY:

* Grant(view_metadata, read_data) → owningGroupAdmins

#### Invariants

* Presets generate grants.
* Preset changes update or revoke template-derived grants.
* Explicit grants remain independent.
* Policy evaluation reads only grants and hierarchy.

This ensures:

* Auditability
* Predictable revocation
* Explainable decisions



## 9. Authorization Model (ABAC)

### 9.1 Attribute Resolution

Authorization evaluates attributes of:

* **Subject**: user id, group memberships, ancestor groups
* **Resource**: owner group, collections, collection ancestry
* **Grant**: active grants, scope, validity window
* **Context** (optional): time, environment, purpose

---

### 9.2 Policy Shape

Policies are pure, side‑effect‑free functions:

```
allow(subject, resource, context) -> decision
```

Policies **must not**:

* Traverse hierarchies
* Iterate over datasets
* Mutate state

Traversal is delegated to utilities backed by closure tables.

---

### 9.3 Authorization Paths: Consumption vs Governance

The authorization model has two distinct evaluation paths:

#### A. Consumption Actions (Data Access)

Evaluation order:

1. Platform overrides (incident freeze)
2. Ownership membership (subject is member of owning group or ancestor)
3. Explicit active grants to dataset
4. Explicit active grants to collection containing dataset
5. Deny

**Example**: `dataset.read_data`

Allowed if **any** of:

* Subject belongs (directly or transitively) to the dataset’s owning group
* Subject has an active `read_data` grant to the dataset
* Subject has an active `read_data` grant to a collection containing the dataset

This rule is monotonic and explainable.

#### B. Governance Actions (Administrative Control)

Evaluation logic (no grant lookup required):

```
allow dataset.admin if:
  user is admin of dataset.ownerGroupId OR
  user is platform admin
```

**Note**: Ancestor group admins do **not** have governance authority. They have oversight visibility only.

#### C. Governance Visibility (Oversight)

For read-only governance observability:

```
allow dataset.view_governance_metadata if:
  user is admin of dataset.ownerGroupId OR
  user has oversight_view over dataset.ownerGroupId OR
  user is platform admin
```

This is distinct from:

* `dataset.read_data` (data-plane, grant-based)
* `dataset.view_metadata` (consumption-level, grant-based)

This is a **governance-plane permission** (structure-based).

Similarly for groups:

```
allow group.view if:
  user is member of group OR
  user is admin of group OR
  user has oversight_view over group OR
  user is platform admin

allow group.view_members if:
  user is admin of group OR
  user has oversight_view over group OR
  user is platform admin

allow group.edit_members if:
  user is admin of group OR
  user is platform admin
```

---

## 10. Explainability and Effective Access

Every authorization decision must be explainable as:

* The minimal set of grants and relationships that caused it

Examples:

* “Access via Collection X granted to Group Y”
* “Access via Lab Z membership (ancestor of owning group)”

Explainability is a **hard invariant**, not a UI feature.

---

## 11. Administration and Delegation

### 11.1 Group Admin Authority (Structural, Not Grant-Based)

Group admins have **local governance authority only**.

Group admins of group G may:

* Manage membership of G (not descendant groups)
* **Grant consumption access** to resources owned by G
* Edit metadata of datasets owned by G
* Initiate ownership transfer of datasets owned by G (requires dual consent)
* Revoke grants on resources owned by G
* Archive or deprecate datasets owned by G

Group admins do **NOT** automatically have authority over descendant groups or their resources.

Ancestor group admins have **oversight visibility** (read-only) over descendant groups and their resources, but no governance authority.

Platform admins may override any decision for incident response.

---

## 12. Lifecycle Management

### 12.1 Groups

* Creation
* Reparenting (transactional closure update)
* Archival (no new grants, history preserved)

#### Reparenting Safety

Because admin authority is local only:

* Reparenting changes oversight visibility
* Reparenting does **not** change governance authority
* No dataset access grants are affected
* No ownership changes occur

This is a critical safety property.

---

### 12.2 Datasets and Collections

#### Ownership Transfer (Dual Consent)

Transferring dataset ownership from Group A to Group B requires:

1. User must be admin of **both** source group (A) and target group (B)
2. **OR** explicit consent from admins of both groups

Rationale:

* Ownership defines governance authority
* Source group loses control
* Target group gains control
* This is a high-impact governance operation
* Dual consent prevents unauthorized authority shifts

Single-admin shortcut:

* If user is admin of both groups, dual consent is implicit
* Authority chain is clear and auditable

Audit record includes:

* Actor identity
* Source group admin authority
* Target group admin authority
* Timestamp
* Provenance

#### Other Lifecycle Operations

* Deprecation (admin of owning group)
* Controlled retirement (admin of owning group or platform admin)

Access changes propagate immediately.

---

## 13. Auditing and Observability

Every material event emits an immutable audit record:

* grant.created
* grant.revoked
* grant.expired
* policy.decision

Audit records include:

* actor
* authority
* resource
* policy version
* timestamp

Auditability is guaranteed by construction, not reconstruction.

---

## 14. Scalability Characteristics

| Aspect              | Behavior          |
| ------------------- | ----------------- |
| Authorization reads | Indexed, O(log n) |
| Group writes        | O(n), rare        |
| Grant checks        | Set‑based         |
| Dataset scale       | Millions          |

---

## 15. Extensibility and Future Considerations

### 15.1 Adding New Capabilities

Future features are added by:

* Introducing new attributes
* Adding new policies
* Defining new resource types
* Adding new consumption actions (always grant-based)

Examples supported without redesign:

* Time‑bound access
* Purpose‑based access
* External collaborators
* Training/DUA enforcement
* Dataset versioning

---

## 16. Summary

This design establishes a **minimal but complete authorization core** with critical architectural separations:

### Core Components

* Hierarchical groups via closure tables
* Group‑owned datasets and collections
* Grant‑centric access control for consumption
* ABAC policies with strict separation of concerns
* Mandatory explainability and auditability

### Critical Separations

1. **Organizational Hierarchy vs Governance Authority**
   * Hierarchy determines membership and oversight visibility
   * Ownership determines governance control
   * Admin authority is local only

2. **Consumption vs Governance**
   * Grants define consumption rights (data-plane)
   * Ownership + admin role defines governance authority
   * These are evaluated via separate authorization paths

3. **Oversight vs Authority**
   * Oversight provides read-only governance observability
   * Authority allows state mutation
   * Ancestor admins get oversight, not authority

### Key Invariants

* Ownership defines who may control access
* Grants define who may consume data
* Admin authority never derives from hierarchy alone
* Reparenting is safe (no governance authority changes)
* Ownership transfers require dual consent
