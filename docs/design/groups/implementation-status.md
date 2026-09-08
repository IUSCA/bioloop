---
title: Implementation Status
order: 8
status: reference
last_verified: 2026-09-08
---

::: warning Code map, not a design record
This page maps the [groups design](./design.md), [access presets](./access-presets.md),
[invitations](./invitations.md), and [use cases](./use-cases.md) onto the code that
implements them. It exists so nobody has to re-read the whole repository to answer
"is this built yet, and where?".

It is a snapshot. Re-verify against `api/prisma/schema.prisma`,
`api/src/authorization/`, and `api/src/services/` before relying on any line here.

For an argument about whether the design itself is right, see
[Design Review](./design-review.md). For what was decided in response, see
[Decisions](./decisions.md), and for the work that follows from it, see the
[MVP Implementation Plan](./mvp-plan.md).
:::

# Groups — Implementation Status

## Summary

The authorization **core** is built and tested: closure-table hierarchy, subject/resource
polymorphism, atomic grants with a DB-level non-overlap guarantee, collections as
authorization containers, the system principals, access requests with preset
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
| Membership + roles | `group_user` (validity columns), `GROUP_MEMBER_ROLE`, view `active_group_user` | `/groups/:id/members`, `/admins/:userId` | `services/groups.js` | `GroupMembersTab.vue` |
| Membership transitivity | view `effective_user_groups` over `active_group_user` | — | `hydrators/user.js` → `effective_group_ids` | — |
| Oversight visibility | view `effective_user_oversight_groups` | — | `hydrators/user.js` → `oversight_group_ids` | — |
| Collections | `collection`, `collection_dataset` (validity columns), view `active_collection_dataset` | `routes/collections.js` | `services/collections.js` | `pages/v2/collections/` |
| Grants | `grant`, `grant_access_type`, view `valid_grants` | `routes/grants.js` | `services/grants/` | `components/v2/grants/` |
| Grant presets | `grant_preset`, `grant_preset_item` | `/grants/presets` | seeded from `src/constants.js` | `useGrantPresets.js` |
| Access requests | `access_request`, `access_request_item` | `routes/access_requests.js` | `services/access_requests/` | `pages/v2/access-requests/` |
| Audit | `authorization_audit` (monthly partitions) | `routes/audit.js` | `services/audit.js`, `authorization/builtin/audit/` | `pages/v2/audit-logs.vue` |
| ABAC engine | — | `authorize()` middleware | `authorization/core/`, `authorization/builtin/policies/` | capability flags on responses |
| System principals (`Public`, `Authenticated Users`) | seeded rows + DB rules, in the 2026-03-02 and `20260908020000_public_principal` migrations | both selectable as grant subjects | `services/grants/helpers.js` | `SubjectSelector.vue`, `GroupIcon.vue` |
| Access type implication | `grant_access_type_implication`, seeded from `constants.js` | closure built once at startup, read at both grant-check sites | `services/grants/accessTypeClosure.js`, `services/grants/helpers.js` | — |
| Restriction layer | `restriction`, `restriction_type`, `effective_restriction` view | checked before every policy, filters capabilities | `authorization/builtin/restrictions.js`, `services/restrictions.js` | archive and unarchive dialogs |
| Platform admin | — | one engine check ahead of every action policy | `authorization/index.js`, `authorization/core/middlewares.js` | `PLATFORM ADMIN` caller-role badge |
| Consent codes | `dataset_use_condition` | accepted by `POST /datasets` as `use_conditions` | `services/datasets_v2/useConditions.js` | none |
| Ownership transfer | `authority_transfer` **(table only)** | none | none | none |
| Invitations | none | none | none | none |

Key entry points:

- Policy definitions: [api/src/authorization/builtin/policies/](https://github.com/IUSCA/bioloop/tree/main/api/src/authorization/builtin/policies) — one file per resource type.
- Effective-access SQL: [api/src/services/grants/helpers.js](https://github.com/IUSCA/bioloop/blob/main/api/src/services/grants/helpers.js) — the `subjects ∪ resources` CTE pattern that unions direct user grants, group grants via closure, collection grants, and both system principals.
- Views and constraints: [the 2026-03-02 migration](https://github.com/IUSCA/bioloop/blob/main/api/prisma/migrations/20260302211516_hierarchical_groups_collections_and_data_access/migration.sql) — `effective_user_groups`, `effective_user_oversight_groups`, `valid_grants`, the `grant_no_overlap` GiST exclusion constraint, and the system-principal protection rules.

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

**Membership and collection history.** `group_user` and `collection_dataset` rows are closed,
never deleted. Each carries `removed_at` and `removed_by`, and `group_user` also carries
`valid_until` for a membership with a scheduled end. A partial unique index permits at most
one open row per pair, so re-adding a removed member opens a second row and leaves the gap
visible. Every "who is a member now?" read goes through the `active_group_user` and
`active_collection_dataset` views, including the `group_memberships` attribute the policies
evaluate; the raw relation is named `group_membership_history` so an unfiltered read has to
be asked for deliberately. See
[decision 1](./decisions.md#_1-membership-and-collection-history-are-preserved).

**Audit.** Every material event writes through `AuditBuilder` inside the same transaction
as the change, with name snapshots so records stay readable after renames.

**Archiving.** Enforced for group metadata edits, membership mutations, collection edits,
and collection-membership changes.

**Tests.** `api/tests/services/{groups,grants,collections,access-requests}/` each carry
lifecycle, invariants, and concurrency suites. The ABAC core has its own tests.

---

### Every dataset has an owning group

`dataset.owner_group_id` is `NOT NULL`. Datasets that had no owner were moved into
`Unassigned Datasets`, an archived system group with a fixed id
(`constants.UNASSIGNED_DATASETS_GROUP_ID`) that has no members, so only platform admins
reach it. A `DO INSTEAD NOTHING` rule blocks deleting the group.

Creation does not fall back to that group. The three dataset creation paths do not send an
owning group yet, so they now fail at the database level rather than returning an error
that names the missing field; that work, and the worker release it needs, is tracked as
`.todo` epic 3 T4.

### A public principal exists

Two system principals are seeded, both protected from deletion, membership, and any place
in the group hierarchy: `Authenticated Users` (renamed from `Everyone`, keeping its id so
existing grants and audit records resolve) and `Public`. `Public` is the wider of the two,
so a signed-in user's subject set contains both, and the three subject-set CTEs in
`services/grants/helpers.js` union them in.

Every route still requires authentication, so a grant to `Public` reaches the same people
as one to `Authenticated Users` today. Serving pages to people who are not signed in is
separate work and is not started.

### Access types imply one another

`grant_access_type_implication` holds a partial order over the twelve access types as ten
edges, seeded from `GRANT_ACCESS_TYPE_IMPLICATIONS` in `constants.js`.
`services/grants/accessTypeClosure.js` builds the transitive closure once per process and
caches it; startup builds it eagerly, so a cyclic graph stops the process rather than one
request.

The closure is read in both directions at the two places access types are resolved.
`userHasGrant` widens the requirement, so a check for `VIEW_METADATA` matches a grant of
`DOWNLOAD` within the same query. `getGrantAccessTypesForUser` widens the holding, so a
user granted `DOWNLOAD` is reported as also having `LIST_FILES` and `VIEW_METADATA`.

The order only widens what a grant satisfies. Restrictions, when they arrive, only narrow;
the two are kept apart on purpose.

### Restrictions compose by AND

`restriction` rows attach to a group or a resource and block actions independently of any
grant: `allowed = no restriction blocks this AND some grant permits it`. One type exists,
`ARCHIVED`. The `effective_restriction` view resolves where a restriction reaches — the
group it names, every descendant group, and the datasets and collections those groups
govern — so archiving a lab freezes its projects and their data in one row.

The check runs before the policy, at the middleware, and is injected as a dependency so the
core engine knows nothing about restrictions. It also filters the capability set, so the UI
does not offer a button that would return 403. A blocked action returns 403 naming the
restriction.

`MUTATING_ACTIONS` and `READING_ACTIONS` in `authorization/builtin/restrictions.js` classify
all 61 registered policy actions, and a test asserts the classification is complete and
mentions no action that does not exist. `unarchive` is the only exemption, because blocking
it would make an archived group impossible to restore.

Archiving writes a restriction row in the same transaction that sets `is_archived`, which
remains as the denormalisation the listings, the archived filter, and the UI badge read. A
test asserts the two agree for every group and collection. The service-level `is_archived`
checks that predate this are kept, so a service called outside a route is still guarded.

### Platform admin is one check in the engine

The engine allows a platform admin every action before consulting the action's own policy,
so no built-in policy names the role. Seventy-seven hand-written `isPlatformAdmin` terms came
out of the five policy files, and a test asserts none has come back.

The check runs after the restriction check, not before it. An archived group is archived for
a platform admin too, and a test covers that.

`platformAdminOnly` names an action nobody qualifies for on their own, reachable only through
the short-circuit. It replaces what `Policy.or([isPlatformAdmin])` used to say, and stops the
removal from leaving an empty combinator that reads as an oversight.

`GET /audit/records` gained authorization it never had. It is platform admin only, expressed
through a small `audit` policy container rather than a hand-written role check, so the rule
still lives in one place.

### Derived and source dataset access are independent

A derived dataset's access is decided on the derivative alone. A derivative may be shared
more widely than the data it came from, and a source may be shared more widely than
anything derived from it. Neither constrains the other.

A grant-time rule refusing a derivative wider than its narrowest source was built and then
removed, per
[decision 10](./decisions.md#_10-derived-and-source-dataset-access-are-independent). The
absence is asserted rather than left implicit: `tests/services/grants/derivedIndependence.test.js`
fails if the coupling is reintroduced.

`dataset_hierarchy` still records which dataset came from which. It drives the Sources and
Derivatives tabs and answers provenance questions, and no query treats it as an
authorization edge.

### Consent codes are captured, not enforced

`dataset_use_condition` records one row per condition on a dataset: the vocabulary the code
came from, the code, an optional label, an optional note, and who recorded it when.
`POST /datasets` accepts a `use_conditions` array and `buildDatasetCreateQuery` writes the
rows in the same statement as the dataset. `services/datasets_v2/useConditions.js` records
them after the fact for datasets already registered, and answers the query the table exists
for: which datasets carry a given code.

No vocabulary lookup table is seeded. GA4GH Data Use Ontology identifiers cannot be verified
from inside this repository, and seeding unverified ones would state a guess as a fact. The
`system` column is free text, so DUO, a local code list, or a study's own scheme all fit,
and a verified DUO seed can be added later without changing the table.

Nothing reads these rows for an authorization decision. A test asserts it: a dataset
carrying the strictest-sounding condition in the vocabulary is reachable by exactly the same
people as one carrying none.

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

### 3. `dataset.read_data` checks the wrong access type — **resolved**

[dataset.js](https://github.com/IUSCA/bioloop/blob/main/api/src/authorization/builtin/policies/dataset.js) implements
`read_data` as `userHasGrant('DATASET:LIST_FILES')`. There is no `DATASET:READ_DATA`
access type seeded, so `read_data` and `list_files` are currently the same permission.
Either intentional (file listing *is* the read plane today) or a leftover — worth a
decision before more actions depend on it.

**Resolved as intentional.** File listing is the read plane. No `DATASET:READ_DATA` type is
added, the check is deliberate rather than a stand-in, and the access type order supplies
what the hand-written implication was standing in for: `DOWNLOAD`, `COMPUTE`, and
`REMOTE_ACCESS` all imply `LIST_FILES`. See
[decision 7](./decisions.md#_7-access-types-imply-one-another).

---

## Gaps

### Not started

- **Invitations.** No `group_invitation` model, route, service, or UI. The design record is complete and carries an implementation checklist.
- **Ownership transfer / dual consent.** The `authority_transfer` table exists in the schema and is referenced by **zero lines of code**. No route, no service, no UI, for either datasets or collections.
- **Reparenting.** Deliberately deferred — [routes/groups.js:536](https://github.com/IUSCA/bioloop/blob/main/api/src/routes/groups.js#L536) carries a comment saying not to implement until there is a use case. The closure-table rewrite it would need does not exist.
- **Visibility presets.** The design's `EVERYONE` / `OWNING_GROUP` / `INSTITUTION` / `PARENT_GROUP` subject-resolution presets and composite `OWNING_GROUP:DOWNLOADABLE` form are not modeled. Only access presets exist; subjects are always picked explicitly.
- **Renewals.** `ACCESS_REQUEST_TYPE.RENEWAL` and `previous_grant_ids` are in the schema, but the route rejects anything but `NEW` and the renewal-context endpoint is commented out.
- **Notifications on access decisions.** Use cases 9 and 54 ("no silent access changes") are unmet: nothing in `services/grants/` or `services/access_requests/` touches the notification system, even though the platform has one.
- **Access history queries** (use case 34). The data is now preserved, but nothing reconstructs effective access as of a past date from it.
- **Compliance reporting / least-privilege review** (use cases 35, 36). No report generation or broad-access detection.
- **Training / DUA preconditions** (use cases 45, 46). Named as extensible in the design; no attributes or policy hooks exist.

### Built but not reachable

- **`expireStaleRequests`** is implemented and tested but **never called** — no cron, no route, no worker. Requests will sit `UNDER_REVIEW` forever in a running deployment.
- **`DATASET:REMOTE_ACCESS`**, **`DATASET:REQUEST_ACCESS`**, and **`COLLECTION:REQUEST_ACCESS`** are seeded access types that no policy or route ever checks.
- **`group.add_dataset`, `group.add_collection`, `group.view_audit_logs`** policy actions are defined but never passed to `authorize()`.
- **`allow_user_contributions`** can be set and read, but nothing enforces it. The design's contributor upload path (auto-assign when one eligible group, prompt when several, reject when none) is not implemented, and the `user_dataset_contribution` table is written by no code.
- Several dataset and collection policy actions (`manage_grants`, `review_access_requests`, `list_grants`, `transfer_ownership`, `view_collections`, `view_sensitive_metadata`) are unused — though the first four are *functionally* covered because the grant and access-request routes carry their own equivalent policies.

### Enforcement holes

- **`GET /audit/records` is platform admin only, not scoped.** Phase 9 closed the hole: the route carried no authorization at all, so any logged-in user could read the whole audit log. It now requires a platform admin. The design scopes audit visibility to owning-group admins and oversight as well, which needs the query filtered by the caller's authority rather than merely gated.
- **Access-request creation is ungated on the resource.** `authorize('access_request', 'create')` is `Policy.always`, and the service validates only the *subject*. A user who knows any resource UUID can file a request against a resource they cannot see, and nothing checks `REQUEST_ACCESS`. `assertGrantItemsApplicableToResourceType` is called on grant creation but not here, so a request can also name access types that do not apply to the resource type.
- **Legacy `/datasets` routes bypass ABAC entirely.** They still use the old RBAC `accessControl()` middleware. The group model only governs `/v2/datasets`. Until the legacy surface is retired or migrated, the "consistency across interfaces" expectation (use cases 11, 56) does not hold.

---

## Suggested order of work

Superseded by the [MVP Implementation Plan](./mvp-plan.md), whose phases 1 and 2 are complete. The
list below predates it and is kept for the items the plan does not cover:

1. Scope `GET /audit/records` to owning-group admins and oversight; it is platform admin only today. Fix the `unarchive` policy binding.
2. Gate access-request creation on resource visibility and `REQUEST_ACCESS`; validate item applicability.
3. Schedule `expireStaleRequests`.
4. Resolve deviation 1 (member consumption access) in the design document, then align the policies.
5. Complete archive prohibitions.
6. Notifications for grant and access-request decisions.
7. Contributor uploads (`allow_user_contributions` + `user_dataset_contribution`).
8. Invitations — the design is ready to build against.
9. Ownership transfer, then reparenting.
