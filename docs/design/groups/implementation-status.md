---
title: Implementation Status
order: 8
status: reference
last_verified: 2026-09-03
---

::: warning Code map, not a design record
This page maps the [groups design](./design.md), [access presets](./access-presets.md),
[invitations](./invitations.md), and [use cases](./use-cases.md) onto the code that
implements them. It exists so nobody has to re-read the whole repository to answer
"is this built yet, and where?".

It is a snapshot. Re-verify against `api/prisma/schema.prisma`,
`api/src/authorization/`, and `api/src/services/` before relying on any line here.
:::

# Groups — Implementation Status

## Summary

The authorization **core** is built and tested: closure-table hierarchy, subject/resource
polymorphism, atomic grants with a DB-level non-overlap guarantee, collections as
authorization containers, the `Everyone` principal, access requests with preset
expansion and supersession, and a partitioned audit table. Roughly 8,300 lines of API
code and ~20 service test files back it.

What is missing is mostly at the **edges** of the design: no invitations, no ownership
transfer, no reparenting, no visibility presets, no notifications on access decisions,
no scheduled expiry job, and a handful of routes and access types that were designed
but never wired up. There are also three places where the shipped behavior deliberately
or accidentally departs from the written design — see [Deviations](#deviations).

---

## Code map

| Design concept | Schema | API surface | Service | UI |
|---|---|---|---|---|
| Group + hierarchy | `group`, `group_closure` | `routes/groups.js` | `services/groups.js` | `pages/v2/groups/`, `components/v2/groups/` |
| Membership + roles | `group_user`, `GROUP_MEMBER_ROLE` | `/groups/:id/members`, `/admins/:userId` | `services/groups.js` | `GroupMembersTab.vue` |
| Membership transitivity | view `effective_user_groups` | — | `hydrators/user.js` → `effective_group_ids` | — |
| Oversight visibility | view `effective_user_oversight_groups` | — | `hydrators/user.js` → `oversight_group_ids` | — |
| Collections | `collection`, `collection_dataset` | `routes/collections.js` | `services/collections.js` | `pages/v2/collections/` |
| Grants | `grant`, `grant_access_type`, view `valid_grants` | `routes/grants.js` | `services/grants/` | `components/v2/grants/` |
| Grant presets | `grant_preset`, `grant_preset_item` | `/grants/presets` | seeded from `src/constants.js` | `useGrantPresets.js` |
| Access requests | `access_request`, `access_request_item` | `routes/access_requests.js` | `services/access_requests/` | `pages/v2/access-requests/` |
| Audit | `authorization_audit` (monthly partitions) | `routes/audit.js` | `services/audit.js`, `authorization/builtin/audit/` | `pages/v2/audit-logs.vue` |
| ABAC engine | — | `authorize()` middleware | `authorization/core/`, `authorization/builtin/policies/` | capability flags on responses |
| `Everyone` principal | seeded row + DB rules in the 2026-03-02 migration | selectable as grant subject | `services/grants/helpers.js` | `SubjectSelector.vue` |
| Ownership transfer | `authority_transfer` **(table only)** | none | none | none |
| Invitations | none | none | none | none |

Key entry points:

- Policy definitions: [api/src/authorization/builtin/policies/](https://github.com/IUSCA/bioloop/tree/main/api/src/authorization/builtin/policies) — one file per resource type.
- Effective-access SQL: [api/src/services/grants/helpers.js](https://github.com/IUSCA/bioloop/blob/main/api/src/services/grants/helpers.js) — the `subjects ∪ resources` CTE pattern that unions direct user grants, group grants via closure, collection grants, and `Everyone`.
- Views and constraints: [the 2026-03-02 migration](https://github.com/IUSCA/bioloop/blob/main/api/prisma/migrations/20260302211516_hierarchical_groups_collections_and_data_access/migration.sql) — `effective_user_groups`, `effective_user_oversight_groups`, `valid_grants`, the `grant_no_overlap` GiST exclusion constraint, and the `Everyone`-protection rules.

---

## Built and working

**Hierarchy.** Closure table with depth-0 self rows, maintained on create and
`create_child`. `effective_user_groups` resolves a user to every group they are a member
of *or an ancestor of one they belong to*, so a grant to a parent covers descendant
members — exactly the transitivity the design specifies. Ancestors, descendants, and a
platform-admin-only full hierarchy view are all exposed.

**Oversight.** `effective_user_oversight_groups` is admin-of-strict-ancestor
(`depth > 0`), so it correctly excludes the group you directly administer. Wired into
group, dataset, collection, grant, and access-request policies as read-only.

**Grants.** Atomic, never deleted, with `revoked_at` / `revocation_type` and both
`issuing_authority_id` and `revoking_authority_id` snapshotted so provenance survives an
ownership change. The no-overlap invariant is enforced by a Postgres GiST exclusion
constraint over a generated `tsrange`, not by application logic. Supersession is
implemented in `GrantIssueService`: a longer approval revokes-as-`SUPERSEDED` and
re-creates rather than colliding.

**Presets.** Modeled in the DB as the access-presets record decided, seeded from
`src/constants.js`, resource-type-scoped, and expanded at approval time with the later
of the two expirations winning. `buildEffectiveGrants` powers a dry-run preview
(`POST /grants/compute-effective-grants`) so reviewers see the outcome before approving.

**Access requests.** Full state machine (`DRAFT → UNDER_REVIEW → APPROVED /
PARTIALLY_APPROVED / REJECTED / WITHDRAWN / EXPIRED`), per-item decisions, group requests
by group admins, and refusal of on-behalf-of-another-user requests.

**Zero-default listing.** Enforced at the query layer, not in the UI. Dataset, collection,
and group searches build a CTE of what the caller can reach (owner-group admin, oversight,
or grant) and filter inside SQL. Attribute filters then strip fields per caller role.

**Audit.** Every material event writes through `AuditBuilder` inside the same transaction
as the change, with name snapshots so records stay readable after renames.

**Archiving.** Enforced for group metadata edits, membership mutations, collection edits,
and collection-membership changes.

**Tests.** `api/tests/services/{groups,grants,collections,access-requests}/` each carry
lifecycle, invariants, and concurrency suites. The ABAC core has its own tests.

---

## Deviations

Places where the code and the design disagree. Each is a decision to make, not
necessarily a bug.

### 1. Owning-group *members* get no consumption access

The design's consumption path lists "subject is a member of the owning group" as an
allow condition, and use case C.9 says members of the owning group and its descendants
can read without explicit grants. The code does not do this: only owning-group **admins**
get structural data access; ordinary members need a grant like anyone else.

The design contradicts itself here — the same document also states grants are the only
source of consumption rights and that access is zero-default. The implementation picked
the stricter reading. **The design document should be corrected to match, or the policies
changed.**

### 2. `unarchive` policy is defined but not used

`groupPolicies` defines `unarchive: isPlatformAdmin`, matching the design's requirement
that reactivating governance authority is platform-admin-only. The route at
[api/src/routes/groups.js:316](https://github.com/IUSCA/bioloop/blob/main/api/src/routes/groups.js#L316) authorizes with
`'group', 'archive'` instead, so **any group admin can unarchive their own group.**

### 3. `dataset.read_data` checks the wrong access type

[dataset.js](https://github.com/IUSCA/bioloop/blob/main/api/src/authorization/builtin/policies/dataset.js) implements
`read_data` as `userHasGrant('DATASET:LIST_FILES')`. There is no `DATASET:READ_DATA`
access type seeded, so `read_data` and `list_files` are currently the same permission.
Either intentional (file listing *is* the read plane today) or a leftover — worth a
decision before more actions depend on it.

---

## Gaps

### Not started

- **Invitations.** No `group_invitation` model, route, service, or UI. The design record is complete and carries an implementation checklist.
- **Ownership transfer / dual consent.** The `authority_transfer` table exists in the schema and is referenced by **zero lines of code**. No route, no service, no UI, for either datasets or collections.
- **Reparenting.** Deliberately deferred — [routes/groups.js:536](https://github.com/IUSCA/bioloop/blob/main/api/src/routes/groups.js#L536) carries a comment saying not to implement until there is a use case. The closure-table rewrite it would need does not exist.
- **Visibility presets.** The design's `EVERYONE` / `OWNING_GROUP` / `INSTITUTION` / `PARENT_GROUP` subject-resolution presets and composite `OWNING_GROUP:DOWNLOADABLE` form are not modeled. Only access presets exist; subjects are always picked explicitly.
- **Renewals.** `ACCESS_REQUEST_TYPE.RENEWAL` and `previous_grant_ids` are in the schema, but the route rejects anything but `NEW` and the renewal-context endpoint is commented out.
- **Notifications on access decisions.** Use cases 9 and 54 ("no silent access changes") are unmet: nothing in `services/grants/` or `services/access_requests/` touches the notification system, even though the platform has one.
- **Compliance reporting / least-privilege review** (use cases 35, 36). No report generation or broad-access detection.
- **Training / DUA preconditions** (use cases 45, 46). Named as extensible in the design; no attributes or policy hooks exist.

### Built but not reachable

- **`expireStaleRequests`** is implemented and tested but **never called** — no cron, no route, no worker. Requests will sit `UNDER_REVIEW` forever in a running deployment.
- **`DATASET:REMOTE_ACCESS`**, **`DATASET:REQUEST_ACCESS`**, and **`COLLECTION:REQUEST_ACCESS`** are seeded access types that no policy or route ever checks.
- **`group.add_dataset`, `group.add_collection`, `group.view_audit_logs`** policy actions are defined but never passed to `authorize()`.
- **`allow_user_contributions`** can be set and read, but nothing enforces it. The design's contributor upload path (auto-assign when one eligible group, prompt when several, reject when none) is not implemented, and the `user_dataset_contribution` table is written by no code.
- Several dataset and collection policy actions (`manage_grants`, `review_access_requests`, `list_grants`, `transfer_ownership`, `view_collections`, `view_sensitive_metadata`) are unused — though the first four are *functionally* covered because the grant and access-request routes carry their own equivalent policies.

### Enforcement holes

- **`GET /audit/records` has no authorization at all.** It sits behind `authenticate` and nothing else, so any logged-in user can read the entire authorization audit log — actors, subjects, resource names, decisions. The design scopes audit visibility to owning-group admins, oversight, and platform admins.
- **Access-request creation is ungated on the resource.** `authorize('access_request', 'create')` is `Policy.always`, and the service validates only the *subject*. A user who knows any resource UUID can file a request against a resource they cannot see, and nothing checks `REQUEST_ACCESS`. `assertGrantItemsApplicableToResourceType` is called on grant creation but not here, so a request can also name access types that do not apply to the resource type.
- **Archive prohibitions are partial.** The design forbids, on an archived group: creating grants on its resources, creating datasets or collections owned by it, and creating child groups. None of those are checked — only metadata, membership, and collection-content mutations are.
- **Legacy `/datasets` routes bypass ABAC entirely.** They still use the old RBAC `accessControl()` middleware. The group model only governs `/v2/datasets`. Until the legacy surface is retired or migrated, the "consistency across interfaces" expectation (use cases 11, 56) does not hold.
- **`dataset.owner_group_id` is nullable.** Pre-existing datasets with no owning group fall outside the ownership-based authorization path.

---

## Suggested order of work

Roughly by risk, then by how much the design depends on it:

1. Authorize `GET /audit/records`; fix the `unarchive` policy binding.
2. Gate access-request creation on resource visibility and `REQUEST_ACCESS`; validate item applicability.
3. Schedule `expireStaleRequests`.
4. Resolve deviation 1 (member consumption access) in the design document, then align the policies.
5. Complete archive prohibitions.
6. Notifications for grant and access-request decisions.
7. Contributor uploads (`allow_user_contributions` + `user_dataset_contribution`).
8. Invitations — the design is ready to build against.
9. Ownership transfer, then reparenting.
