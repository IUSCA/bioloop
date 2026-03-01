---
title: Authorization Actions, Policies, and Lifecycles
---

# Authorization Actions, Policies, and Lifecycles

This document provides a compact, fully normalized authorization specification for the hierarchical groups system. It defines the complete action surface, authorization rules, and lifecycle semantics for access requests and grants.

Nothing essential is removed; redundancy is eliminated.

---

## 1. Core Primitives

There are only three:

1. **Ownership** → defines governance authority
2. **Membership (hierarchical, transitive upward)** → defines inherited ownership scope
3. **Grant (atomic, auditable)** → defines consumption rights only

Everything reduces to these.

---

## 2. Action Surface (Exhaustive, Minimal)

### 2.1 Dataset

#### A. Consumption (Grant-Based Only)

These are the only actions that ever appear in a Grant row:

* `dataset.view_metadata`
* `dataset.view_sensitive_metadata`
* `dataset.read_data`
* `dataset.download`
* `dataset.compute` (collapse into read_data if infra does not distinguish)

Nothing else is grantable.

---

#### B. Governance (Ownership/Admin-Based Only)

Never stored as grants.

* `dataset.edit_metadata`
* `dataset.archive`
* `dataset.delete`
* `dataset.transfer_ownership` (dual authority required)
* `dataset.grant_access`
* `dataset.revoke_access`
* `dataset.edit_visibility_preset` (emits/revokes template grants)
* `dataset.view_governance_metadata`

---

### 2.2 Collection

Collections are authorization containers.

#### A. Consumption (Grant-Based)

* `collection.view_metadata`

---

#### B. Governance (Ownership/Admin-Based)

* `collection.edit_metadata`
* `collection.add_dataset`
* `collection.remove_dataset`
* `collection.delete`
* `collection.transfer_ownership`
* `collection.grant_access`
* `collection.revoke_access`
* `collection.view_governance_metadata`

Invariant:
`collection.add_dataset` allowed only if
`dataset.ownerGroupId == collection.ownerGroupId`

---

### 2.3 Group (Structural Only)

No grant-based actions.

#### Lifecycle

* `group.create`
* `group.archive`
* `group.reparent`
* `group.delete` (usually avoided)

#### Metadata

* `group.view_metadata`
* `group.edit_metadata`

#### Membership

* `group.view_members`
* `group.add_member`
* `group.remove_member`
* `group.edit_member_role`

#### Admin

* `group.add_admin`
* `group.remove_admin`

#### Governance Visibility

* `group.view_governance_metadata`

---

## 3. Attribute Model (ABAC Inputs)

### Subject

* `user.id`
* `user.groupIds`
* `user.adminGroupIds`
* `user.isPlatformAdmin`

Derived via closure table:

* `descendantMembers(groupId)`
* `adminAncestorGroups(groupId)` (oversight)

---

### Resource

#### Dataset

* `dataset.ownerGroupId`
* `dataset.collectionIds`

#### Collection

* `collection.ownerGroupId`

---

### Grant

* `subjectType`
* `subjectId`
* `resourceType`
* `resourceId`
* `accessType`
* `validFrom`
* `validUntil`
* `status`

Grants are atomic and immutable (revoked, never deleted).

---

## 4. Authorization Rules (Formalized)

### 4.1 Dataset — Consumption

ALLOW `dataset.X` if ANY:

1. **Ownership membership**

   ```
   user ∈ descendantMembers(dataset.ownerGroupId)
   ```

2. **Direct dataset grant**

   ```
   exists active Grant
     where resourceType = Dataset
     and resourceId = dataset.id
     and accessType = X
     and subject matches user (direct or via group)
   ```

3. **Collection grant**

   ```
   exists collection C containing dataset
   and active Grant
     where resourceType = Collection
     and resourceId = C.id
     and accessType = X
     and subject matches user
   ```

4. **Platform override**

   ```
   user.isPlatformAdmin
   ```

Else deny.

---

### 4.2 Dataset — Governance

ALLOW governance action if:

```
user is admin of dataset.ownerGroupId
OR user.isPlatformAdmin
```

Ancestor admins do NOT qualify.

---

### 4.3 Dataset — Governance Visibility (Oversight)

ALLOW `dataset.view_governance_metadata` if:

```
user is admin of dataset.ownerGroupId
OR user is admin of ancestor of dataset.ownerGroupId
OR user.isPlatformAdmin
```

Oversight is read-only.

---

### 4.4 Collection — Governance

Same pattern as dataset, replacing `ownerGroupId`.

For `collection.add_dataset`:

```
ALLOW if:
user is admin of collection.ownerGroupId
AND dataset.ownerGroupId == collection.ownerGroupId
```

---

### 4.5 Group Rules

#### View Members

ALLOW if:

```
user is admin of group
OR user is admin of ancestor group (oversight)
OR user.isPlatformAdmin
```

---

#### Edit Membership / Admin / Metadata

ALLOW if:

```
user is admin of group
OR user.isPlatformAdmin
```

Ancestor admins cannot mutate.

---

#### Reparent

ALLOW if:

```
(user is admin of group
 AND user is admin of newParentGroup)
OR user.isPlatformAdmin
```

Prevents authority drift.

---

## 5. Visibility Presets

Presets are templates that emit grants.

Examples:

* PUBLIC → Grant(read_data) → Everyone
* DISCOVERABLE → Grant(view_metadata) → Everyone
* GROUP_VISIBLE → Grant(read_data) → ownerGroup

Policy evaluation never reads presets directly.
It reads grants only.

---

## 6. Hard Invariants

1. Ownership defines who controls access.
2. Grants define who consumes data.
3. Governance authority never derives from hierarchy alone.
4. Oversight is read-only.
5. Reparenting never changes governance authority.
6. All consumption access is explainable via grants or ownership membership.

---


## 8. Access Request Lifecycle

An **Access Request** is a workflow object.
It never confers access.
Only a Grant does.

---

### 8.1 Request Scope

A request targets exactly one:

* Dataset
* Collection

And one or more **consumption actions**:

* view_metadata
* view_sensitive_metadata
* read_data
* download
* compute

Requesting governance actions is invalid.

---

### 8.1a Request Types and Attributes

Every request has:

**Core Attributes:**

* `id`
* `type` ∈ {NEW, RENEWAL}
* `resourceType`
* `resourceId`
* `requestedActions[]`
* `requesterId`
* `previousGrantIds[]` (nullable)
* `status`
* `decisionMetadata`

**Request Type Semantics:**

* **NEW** — First-time request or re-request after rejection
* **RENEWAL** — Request after prior grant expired

The `previousGrantIds[]` field references expired grants when `type = RENEWAL`.

This enables:

* Pre-filling prior scope
* Surfacing previous reviewer decision
* Linking audit trails
* Optional fast-path approval (policy-gated)

---

### 8.2 Access Request State Machine

#### States

1. `DRAFT`
2. `SUBMITTED`
3. `UNDER_REVIEW`
4. `APPROVED`
5. `PARTIALLY_APPROVED` (optional, if multi-action)
6. `REJECTED`
7. `WITHDRAWN`
8. `EXPIRED` (not acted on in time)
9. `CLOSED` (terminal archival state)

---

#### Transitions

##### DRAFT → SUBMITTED

Triggered by requester.

Validation:

* Target resource exists
* Actions are valid consumption actions
* No duplicate active request for same scope

---

##### SUBMITTED → UNDER_REVIEW

System assigns to:

* Admins of owning group
  OR
* Designated stewards

---

##### UNDER_REVIEW → APPROVED

Conditions:

* Reviewer is admin of ownerGroup
* Any required compliance conditions satisfied
* Optional expiration defined

Effect:

* Create one Grant per approved action
* Each grant has:

  * grantedBy
  * grantedViaGroup (authority)
  * validFrom
  * validUntil (nullable)

Request state becomes APPROVED.

---

##### UNDER_REVIEW → PARTIALLY_APPROVED (optional)

If some actions approved, some rejected.

System creates grants only for approved actions.


##### UNDER_REVIEW → REJECTED

Must record: reviewer, timestamp, reason

No grants created.

---

##### SUBMITTED / UNDER_REVIEW → WITHDRAWN

Triggered by requester.

No grants created.

---

##### SUBMITTED / UNDER_REVIEW → EXPIRED

If SLA window exceeded.

No grants created.

---

##### APPROVED → CLOSED

Administrative archival.
Grants remain independent.

---

### 8.3 Critical Invariants

* Requests do not grant access.
* Requests are never mutated after terminal state.
* All approvals result in explicit grants.
* Grants outlive requests.
* Revoking a grant does not mutate historical request state.

---

## 9. Access Grant Lifecycle

A **Grant** is a durable authorization fact.

It is not workflow.
It is a security primitive.

---

### 9.1 Grant Creation Paths

A grant can be created via:

1. Access request approval
2. Proactive admin action
3. Visibility preset emission
4. Automated policy (rare; must still emit grant row)
5. Ownership membership (implicit, not stored as grant)

Only 1–4 create Grant records.

---

### 9.2 Grant State Model

Grants are immutable rows with status field.

#### States

1. `ACTIVE`
2. `REVOKED`
3. `EXPIRED`

Grants are never deleted.

---

### 9.3 Temporal Model

Grant validity is determined by:

* status = ACTIVE
* currentTime ≥ validFrom
* (validUntil is null OR currentTime ≤ validUntil)

If validUntil passes → state becomes EXPIRED (logical transition).

---

### 9.4 Grant Transitions

#### ACTIVE → REVOKED

Triggered by:

* Admin of owning group
* Platform admin

Effect:

* Immediate loss of access
* Audit event emitted

Revocation does not delete row.

---

#### ACTIVE → EXPIRED

Automatic when:

* `validUntil < now`

No mutation required if evaluated dynamically.

---

No other transitions allowed.

---

### 9.5 Grant Authority Rules

Grant creation allowed only if:

```
user is admin of resource.ownerGroupId
OR user.isPlatformAdmin
```

Ancestor admins cannot grant.

This preserves governance locality.

---

## 10. Interaction Between Requests and Grants

### 10.1 One Request → Many Grants

If request includes multiple actions:

Example:

* read_data
* download

Approval creates two independent grant rows.

Each can later be revoked independently.

---

### 10.2 Grant Revocation After Approval

If admin revokes grant:

* Grant state → REVOKED
* Request remains APPROVED
* System explanation: "Access revoked on `<date>` by `<actor>`"

Requests are historical artifacts.

---

### 10.3 Changing Visibility Preset

Preset change:

* Emits or revokes template-derived grants
* Does not alter manual grants
* Does not alter request history

---

## 11. Revocation Cascade Rules

### 11.1 Group Membership Removal

If user removed from group:

* All grants where subjectType = Group remain
* But user loses derived access immediately
* No grant mutation required

Access evaluation is dynamic.

---

### 11.2 Ownership Transfer

If dataset.ownerGroup changes:

* Existing grants remain valid
* New owner group gains governance authority
* Old owner loses governance authority
* No automatic revocation

If stricter control desired, must explicitly revoke.

---

### 11.3 Collection Membership Change

If dataset removed from collection:

* All collection-derived access to that dataset disappears immediately
* No grant rows mutated

Access path no longer matches rule 4.1.3.

---

## 12. Expiration & Renewal

### Core Principle

An access request is historical workflow state.
A grant is the authorization fact.

Renewal must:

* Preserve audit integrity
* Preserve prior decision history
* Avoid mutating past approvals
* Avoid resurrecting expired grants invisibly

Therefore:

> **Renewal is always a new request.**
>
> **It may reference prior approved grants.**

---

### 12.1 What "Remember Prior Approvals" Means

From first principles, remembering prior approval means:

1. Pre-fill previous scope (actions + resource)
2. Surface previous reviewer decision
3. Allow fast-path approval if policy permits
4. Retain full audit trace linking requests

It must NOT mean:

* Reactivating expired grants silently
* Extending grants without audit trail
* Bypassing governance authority

---

### 12.2 Re-Request (After Rejection)

**Scenario:** User previously REJECTED.

**Flow:**

1. User creates new request
2. System detects prior request for same resource + actions
3. System marks `request.type = NEW` (not renewal)
4. Prior rejection history is visible to reviewer

**No automatic approval path.**

This is simply a new request with history context.

---

### 12.3 Renewal (After Expiration)

**Scenario:** User had ACTIVE → EXPIRED grant.

**Flow:**

1. User initiates renewal
2. System pre-populates:
   * resource
   * actions
   * previous validity window
   * prior justification (editable)
3. `request.type = RENEWAL`
4. `request.previousGrantIds = expired grants`

State transitions remain identical:

**DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED**

---

### 12.4 Renewal Decision Logic

#### Default (Strict Governance Model)

Renewal requires full review.

Approval creates entirely new grant rows.

Old expired grants remain EXPIRED.

This is the safest baseline.

---

#### Optional Fast-Path Renewal (Policy-Gated)

If all of the following are true:

* Prior grant expired (not revoked)
* No policy changes since prior approval
* Same actions requested
* Same resource
* Same subject
* No compliance flags

Then system may allow:

**SUBMITTED → AUTO_APPROVED**

But:

* Still creates new grant rows
* Emits audit event: `grant.renewed`
* Records renewal basis (policy version match)

This is automation, not reactivation.

---

### 12.5 Grant Lifecycle Clarification for Renewal

**Renewal NEVER transitions:**

```
EXPIRED → ACTIVE  ❌ FORBIDDEN
```

That is explicitly disallowed.

Instead:

* EXPIRED grant remains immutable historical fact
* Renewal produces new grant:
  * new id
  * new validFrom
  * new validUntil
  * new grantedBy

This preserves:

* Audit trail
* Explainability
* Temporal integrity

---

### 12.6 Renewal Edge Cases

#### Grant Was Revoked (Not Expired)

If prior grant `status = REVOKED`:

* Renewal must not fast-path
* Full review required

**Reason:** Revocation is governance action, not time expiry.

---

#### Dataset Ownership Changed

If `dataset.ownerGroup` changed since prior approval:

* Renewal requires review by new owner group
* Fast-path disallowed

---

#### Policy Changed

If dataset moved to restricted status or policy version changed:

* Renewal requires full review
* System must surface policy delta to reviewer

---

### 12.7 Expiration Awareness (UX)

To support good user experience, system should expose:

* Days until expiration
* Expired grants eligible for renewal
* One-click "Request Renewal" action

This is UX convenience, not policy change.

---

### 12.8 Why This Design Is Required

If you allow:

* Direct reactivation of expired grants
* Mutating validUntil on expired grants
* Approval without new grant rows

You break:

* Auditability
* Temporal traceability
* Compliance defensibility

Regulated environments require:

> "Show me who had access between Jan 2024 and Mar 2024."

That is impossible if you reuse grant rows.

---

### 12.9 Time-Bound Grants

If validUntil set:

* Access automatically denied after expiry
* Grant becomes EXPIRED logically

No manual state transition required if evaluated dynamically.

---

## 13. Audit Model

Every material transition emits event:

* access_request.submitted
* access_request.approved
* access_request.rejected
* grant.created
* grant.revoked
* grant.expired
* membership.removed (affects effective access)
* collection.membership.changed

Audit includes:

* actor
* authority group
* resource
* action
* timestamp
* policy version

Explainability requirement:

System must always answer:

"Why does user U have access to dataset D?"

With:

* Ownership path
  OR
* Direct grant
  OR
* Collection grant
  OR
* Platform override

---

