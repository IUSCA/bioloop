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

## Phase 2 — Every dataset has an owning group

Implements [decision 2](./decisions.md#_2-every-dataset-has-an-owning-group).
Satisfies use case 59.

- Seed an archived system group to hold datasets that have no owner.
- Backfill, then apply `NOT NULL` to `dataset.owner_group_id`.
- Tests: the constraint holds, and the quarantine group is listable so its contents can be
  worked through.

## Phase 3 — Public principal

Implements [decision 3](./decisions.md#_3-a-public-principal-exists-and-everyone-is-renamed).
Foundation for use cases A.1 and A.2.

- Rename the existing principal to `Authenticated Users`, keeping its UUID so existing
  grants and audit records resolve.
- Seed a `Public` principal with its own fixed UUID and the same protection rules.
- The effective-access SQL includes the public principal in its subject set.
- Tests: a grant to the public principal is honoured, neither principal can be edited or
  deleted, and the rename leaves existing grants intact.

Routes still require authentication. Serving unauthenticated requests is out of scope by
decision.

## Phase 4 — Access type implication

Implements [decision 7](./decisions.md#_7-access-types-imply-one-another).
Resolves deviation 3.

- Seed an implication table over the existing access types.
- Compute the transitive closure once at startup and cache it.
- Apply the closure where grant access types are resolved, which is the single choke point
  both the policy engine and the direct grant checks pass through.
- Tests: the graph is acyclic, every seeded access type appears in it, a download grant
  satisfies a metadata check, and the closure is not recomputed per request.

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
and [Design Review](./design-review.md) are updated to match, and the work is committed.

Phases 1, 2, 4, 6, and 7 have no user-visible surface of their own. Their UI check is that
the surfaces built on top of them — the members tab, the grant subject picker, the dataset
pages — still behave.
