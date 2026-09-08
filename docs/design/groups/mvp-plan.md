---
title: MVP Implementation Plan
order: 11
status: active
last_verified: 2026-09-08
---

::: tip A work plan, not a design record
The phased plan for implementing the [decisions](./decisions.md). Each phase is a single
commit with its own migration, tests, and documentation update. For what is built today,
see [Implementation Status](./implementation-status.md).
:::

# MVP Implementation Plan

## Ordering principle

Phases are ordered by how much they cost to delay, not by how visible they are.

Phase 1 comes first because it is the only change where delay destroys data that cannot be
recovered. Phase 2 comes next because the problem grows with every dataset created. Phases 3
to 5 change the evaluation path, so every policy written after them is written against the
final shape. Phases 6 and 7 sit on top and change no foundations.

Nothing in this plan builds a feature the first release does not need. Several phases add a
primitive and exactly one consumer of it, deliberately leaving the second consumer unbuilt.

---

## Phase 1 — Membership and collection history — **done**

Implements [decision 1](./decisions.md#_1-membership-and-collection-history-are-preserved).
Satisfies use cases 19 and 34, and unblocks 43.

- Migration: `group_user` gains a surrogate primary key, `valid_from`, `valid_until`,
  `removed_at`, and `removed_by`. A partial unique index on `(group_id, user_id)` over open
  rows keeps at most one active membership per pair.
- `collection_dataset` gains the same shape, without `valid_until`.
- `effective_user_groups` and `effective_user_oversight_groups` filter to open, unexpired
  rows.
- Membership removal and collection-content removal close rows instead of deleting them.
  Re-adding opens a new row rather than reviving the old one, so the gap stays visible.
- Tests: history survives removal, re-adding produces a second row, an expired membership
  confers no access, and a closed membership stops conferring admin authority.

Two things surfaced during implementation that the plan did not anticipate. Prisma relations
cannot be filtered, so `user.group_memberships` — which the owning-group-admin policies read —
would have kept returning closed rows and left a removed admin in authority; the raw relation
is now named `group_membership_history` and the filtered read keeps the obvious name. And
`listDatasetsInCollection` matched removed rows through a relation filter for the same reason.

## Phase 2 — Every dataset has an owning group — **done**

Implements [decision 2](./decisions.md#_2-every-dataset-has-an-owning-group).
Satisfies use case 59.

- Migration: seeds `Unassigned Datasets`, an archived system group with a fixed id, then
  backfills every orphan into it and applies `NOT NULL` to `dataset.owner_group_id`.
- The group has no members, so only platform admins reach it. A `DO INSTEAD NOTHING` rule
  blocks deleting it, so the next batch of orphans still has somewhere to go.
- Tests: the constraint is enforced by the database rather than only by the client, an
  owning group cannot be deleted while it owns datasets, and the group is listable and
  openable so its contents can be worked through.

Creation refuses rather than falling back. A dataset created without an owning group is an
error, not a candidate for quarantine — the exception in decision 2 covers the migration,
which cannot ask a human, and not a live API call, which can. The three creation paths do
not send an owning group yet and now fail at the database level; making them return a
useful error, and updating the workers that call them, is tracked as `.todo` epic 3 T4.

Two things surfaced that the plan did not anticipate. The first sentinel id was
zero-filled, which is not a syntactically valid UUID, so `express-validator`'s `isUUID()`
rejected it and the group was listable but its detail page returned 400; the id now sets
the version and variant nibbles. And `@default(uuid())` in the Prisma schema is
client-side only, so Prisma read phase 1's database defaults as drift and generated a
migration dropping them — the two surrogate keys are now declared `dbgenerated`.

## Phase 3 — Public principal — **done**

Implements [decision 3](./decisions.md#_3-a-public-principal-exists-and-everyone-is-renamed).
Foundation for use cases A.1 and A.2.

- The existing principal is renamed to `Authenticated Users`, keeping its UUID so existing
  grants and audit records resolve.
- A `Public` principal is seeded with its own fixed UUID. The delete rule and the two
  check constraints that protected the old principal now name both.
- The three subject-set CTEs in `services/grants/helpers.js` union both principals in, so
  a grant to either is honoured for any signed-in user.
- Both are offered in the grant subject picker, and both are excluded from group listings
  by id rather than by slug, so a rename cannot put them back.
- Tests: each principal exists under the expected name, takes no members, takes no place
  in the hierarchy, cannot be deleted, is absent from group listings, and confers access
  to a user with no group memberships.

Routes still require authentication. Serving unauthenticated requests is out of scope by
decision, so a grant to `Public` reaches the same people as one to `Authenticated Users`
today.

One thing surfaced that the plan did not anticipate. The seed's
`createDeterministicUuidGenerator` counts up from zero in a UUID's last eight bytes and
sets the same version and variant nibbles that phase 2 had adopted for its sentinel, so
the quarantine group's id was the string the seed also assigns to `Collection 01`. Both
sentinels now carry a `ffffffff` prefix, which the generator can never produce. Phase 2's
migration was corrected in place rather than by a follow-up, because it had run nowhere
but a disposable development database.

## Phase 4 — Access type implication — **done**

Implements [decision 7](./decisions.md#_7-access-types-imply-one-another).
Resolves deviation 3.

- `grant_access_type_implication` holds the order as ten edges over the twelve existing
  access types. The rows are seeded from `GRANT_ACCESS_TYPE_IMPLICATIONS`, alongside the
  access types they reference.
- `services/grants/accessTypeClosure.js` builds the transitive closure once per process
  and caches it. Startup builds it eagerly, so a cyclic graph stops the process rather
  than one request, and anything outside the server builds it on first use.
- The closure is read in both directions at the two places grant access types are
  resolved. `userHasGrant` widens the *requirement*, so a check for `VIEW_METADATA` also
  matches a grant of `DOWNLOAD`, in one query. `getGrantAccessTypesForUser` widens the
  *holding*, so a user granted `DOWNLOAD` is reported as having `LIST_FILES` and
  `VIEW_METADATA` too.
- Tests: the graph is acyclic, every seeded access type appears in it, the seeded rows
  match the constant, the closure is the same cached object on a second call, a download
  grant satisfies a metadata check but not a compute check, and a user with no grant is
  unaffected.

**Deviation 3 is resolved as "file listing is the read plane."** There is no
`DATASET:READ_DATA` access type. The `read_data` policy action checks `DATASET:LIST_FILES`
on purpose rather than as a stand-in, and the order carries the rest: `DOWNLOAD`,
`COMPUTE`, and `REMOTE_ACCESS` all imply `LIST_FILES`. Decision 7's original diagram
included `READ_DATA` and has been corrected. This also settles `.todo` L1 T6.

Nobody's effective access narrowed. The order only widens what a grant satisfies.

## Phase 5 — Restriction layer and archiving — **done**

Implements [decision 6](./decisions.md#_6-restrictions-compose-by-and-grants-stay-additive).
Satisfies use case 17 and closes the archive enforcement holes.

- Migration: `restriction_type` and `restriction`, with `ARCHIVED` as the only type. A
  restriction attaches to exactly one of a group or a resource, enforced by a check
  constraint, and a partial unique index allows one open restriction of a type per target.
  Rows are closed rather than deleted, the same way memberships are.
- `effective_restriction` resolves where a restriction reaches: the group it names, every
  descendant group, and the datasets and collections those groups govern, plus restrictions
  attached straight to a resource.
- Evaluation checks restrictions before policies, for every action. The check is injected
  into the core middleware as a dependency, so the engine stays free of any knowledge of
  restrictions. A blocked action returns 403 naming the restriction rather than a generic
  denial.
- The capability set is filtered the same way, so the UI does not offer a button that would
  403.
- Archiving writes a restriction row in the same transaction that sets `is_archived`, which
  stays as the denormalisation the listings, the archived filter, and the badge read.
- Tests: 19 covering propagation down the tree and to governed resources, reading being
  unaffected, lifting restoring mutation, re-archiving opening a second row, idempotence,
  and the two columns agreeing with the table.

Two things were settled during implementation rather than in the decision.

**The classification of actions is written out, not inferred.** `MUTATING_ACTIONS` and
`READING_ACTIONS` name all 61 registered policy actions, and a test asserts every action
appears in exactly one of them and that neither names an action that does not exist. A
naming convention would silently fail to cover an action somebody adds later. That test
immediately caught two mistakes in the first draft of the lists.

**`unarchive` is the only exemption.** Ownership transfer was exempt for a while, so that
datasets could leave the archived `Unassigned Datasets` group without unarchiving it. That
made the rule harder to state for one workflow, and the archive dialog already promises
users that grant creation and revocation both stop. A platform admin now unarchives,
reassigns, and re-archives, which leaves an audit record of each step.

The service-level `is_archived` checks that predate this phase are kept. They cover the
three operations they always covered, and they still fire when a service is called outside
a route. The restriction layer is what covers the other fifty-odd actions.

## Phase 6 — Derived datasets are never more open than their sources — **reversed**

Built, then removed in phase 8. `services/grants/derivedOpenness.js` ran inside
`_createGrant` and refused a grant that would make a derived dataset reachable by a wider
audience than any of its sources.

[Decision 10](./decisions.md#_10-derived-and-source-dataset-access-are-independent) reversed
it. A derivative may legitimately be shared more widely than the data it came from, so the
source's audience is not a ceiling. Use case 58 is withdrawn.

## Phase 7 — Consent codes — **done**

Implements [decision 9](./decisions.md#_9-consent-codes-are-captured-not-enforced).

- `dataset_use_condition` holds one row per condition on a dataset: `system`, `code`, an
  optional human-readable `label`, an optional free-text `note`, plus `recorded_at` and
  `recorded_by`. A dataset may carry any number of rows, or none.
- The row records which vocabulary a code came from rather than assuming one. No vocabulary
  lookup table is seeded. GA4GH Data Use Ontology identifiers cannot be verified from inside
  this repository, and seeding unverified ones would state a guess as a fact. `system` is
  free text so DUO, a local code list, or a study's own scheme all fit, and a verified DUO
  seed can be added later without changing the table.
- `(dataset_id, system, code)` is unique. Recording the same code twice is a mistake rather
  than a second fact, so `recordUseConditions` skips a repeat and returns how many rows it
  actually added. The same code in a different vocabulary is a different fact and is kept.
- `POST /datasets` accepts a `use_conditions` array and `buildDatasetCreateQuery` turns it
  into a nested create, so the codes land in the same statement as the dataset.
  `services/datasets_v2/useConditions.js` also records them after the fact, for datasets
  already registered.
- Nothing reads these rows for an authorization decision. That is the decision, not an
  omission, and a test asserts it: a dataset carrying the strictest-sounding condition in
  the vocabulary is reachable by exactly the same people as one carrying none.
- `datasetsWithUseCondition(system, code)` is the query the table exists for — somebody asks
  which held data was collected under a particular consent.
- Tests: 11, covering round-trip through registration, who captured them and when, a
  dataset registered with none, a code with no label or note, recording after registration,
  a repeat adding nothing, the same code in two vocabularies, an empty list, the query by
  code, no effect on who can reach the dataset, and deletion taking the rows with it.

---

## Phase 8 — Remove the derived-dataset openness rule

Implements [decision 10](./decisions.md#_10-derived-and-source-dataset-access-are-independent).

- Delete `services/grants/derivedOpenness.js`, its call in `_createGrant`, and its tests.
  Removal rather than a disabled flag, because the rule is wrong and not merely unwanted.
- `dataset_hierarchy` stays. It drives the Sources and Derivatives tabs and answers
  provenance questions, and no query may treat it as an authorization edge.
- Tests: a derived dataset can be granted to `Public` while its source stays scoped. The
  reversal is pinned by a test rather than left as an absence, so a later change that
  reintroduces the coupling fails rather than passing quietly.

## Phase 9 — Platform admin is one check in the engine

Implements [decision 11](./decisions.md#_11-platform-admin-is-one-check-in-the-engine).

- The engine short-circuits for a platform admin before any policy runs, and the 77
  `isPlatformAdmin` terms come out of the built-in policies.
- Restrictions still apply. The short-circuit sits after the restriction check, not before
  it, so an archived group stays archived for a platform admin.
- `GET /audit/records` gains the authorization it never had, which is the hole this change
  exists to close.
- Tests: a platform admin reaches every action a policy could gate; a non-admin is
  unaffected; an archived resource still refuses a platform admin's mutations; and a
  coverage test asserts no built-in policy still names the role.

## Phase 10 — Creating a resource seeds a grant to its owning group

Implements [decision 12](./decisions.md#_12-owning-group-members-get-a-seeded-grant-not-structural-read).

- Dataset and collection creation write a grant to the owning group in the same transaction
  as the resource, so a resource is never briefly unreachable by the group that governs it.
- Settles [deviation 1](./implementation-status.md#deviations). Membership confers no read
  by itself; the seeded row is what members hold, and it is listed and revocable like any
  other grant.
- Existing resources get the same grant through a backfill, so the rule holds for rows that
  predate it.
- Tests: creation writes the grant; a member reads through it; revoking it removes the
  member's access while leaving group admins' structural access intact; the backfill is
  idempotent.

## Phase 11 — Attribution

Implements [decision 13](./decisions.md#_13-attribution-is-its-own-relationship).

- Datasets record funding sources and affiliated groups separately from `owner_group_id`,
  which keeps meaning governance and nothing else.
- Nothing reads these rows for an authorization decision, and a test asserts that adding an
  affiliation does not widen who can reach a dataset.
- Answers use case 13, which asks researchers to cite ownership correctly using data that
  currently has nowhere to live except the `metadata` column.
- Tests: attribution round-trips through the dataset record, several sources and
  affiliations coexist on one dataset, and access is unchanged by any of it.

---

## After each phase

Every phase ends with the same four steps, in order: tests pass, the affected surface is
exercised from the UI where one exists, [Implementation Status](./implementation-status.md)
and [Design Review](./design-review.md) are updated to match, update or create new skill based on operational lessons learned, and the work is committed.

Phases 1, 2, 4, 7, 8, and 9 have no user-visible surface of their own. Their UI check is that
the surfaces built on top of them — the members tab, the grant subject picker, the dataset
pages — still behave.
