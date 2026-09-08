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

## Phase 5 — Restriction layer and archiving

Implements [decision 6](./decisions.md#_6-restrictions-compose-by-and-grants-stay-additive).
Satisfies use case 17 and closes the archive enforcement holes.

- Migration: a restriction table and a seeded restriction-type lookup, with `ARCHIVED` as
  the only type.
- Evaluation checks restrictions before grants, for every action, with one type present.
- Restrictions propagate down the group tree and to the resources a group governs.
- Archiving stops being a hand-written list of prohibited actions and becomes one rule.
- Tests: an archived group blocks every mutation on its resources and its descendants,
  reading is unaffected, and lifting the restriction restores mutation.

## Phase 6 — Derived datasets are never more open than their sources

Implements the buildable half of use case 58.

- A check at grant-issue time walks `dataset_hierarchy` and refuses a grant that would make
  a derived dataset reachable by a wider audience than any of its sources.
- Openness is ordered: public, then authenticated, then group or user.
- Tests: a derivative of a group-only dataset cannot be granted to either system principal,
  an unrelated dataset is unaffected, and a multi-source derivative takes the narrowest
  source.

The other half — restrictions travelling from source to derivative — waits for the second
restriction type, per decision 6.

## Phase 7 — Consent codes

Implements [decision 9](./decisions.md#_9-consent-codes-are-captured-not-enforced).

- A table holding one or more data use codes per dataset, recorded at registration.
- No enforcement anywhere. The codes are captured because the information decays, not
  because anything reads them yet.
- Tests: codes round-trip through dataset registration and are queryable.

---

## After each phase

Every phase ends with the same four steps, in order: tests pass, the affected surface is
exercised from the UI where one exists, [Implementation Status](./implementation-status.md)
and [Design Review](./design-review.md) are updated to match, update or create new skill based on operational lessons learned, and the work is committed.

Phases 1, 2, 4, 6, and 7 have no user-visible surface of their own. Their UI check is that
the surfaces built on top of them — the members tab, the grant subject picker, the dataset
pages — still behave.
