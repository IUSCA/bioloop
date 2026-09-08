---
title: v2 Cut-over
order: 2
status: active
implemented: partial
last_verified: 2026-09-08
---

# Building v2 alongside v1

::: warning Not a description of the running system
This records intent. See [Reference](/reference/) for how the system behaves today.
:::

Bioloop v2 is the groups and access-control layer. It is being built **additively**: new
tables, new routes, and new services sit beside the old ones, and the old ones keep working
untouched. Cut-over is a separate step that happens once, later. This page says how the two
halves are kept apart, and what has to be true before the old half can go.

## The rule

**A v2 feature is written in v2 code.** Never add one by editing a legacy file, even when
the legacy path is the only one that currently runs.

Where a new module would collide with an old name, the new one takes a `_v2` suffix.
`api/src/services/datasets_v2` sits beside the legacy `api/src/services/dataset.js`;
`api/src/routes/datasets_v2` beside `api/src/routes/datasets`. Where there is no collision,
the new module takes the plain name.

**The suffix marks a collision, not a version.** These carry no suffix and are all v2 code:

| Module | What it holds |
|---|---|
| `api/src/authorization/` | The whole ABAC engine — policies, hydrators, restrictions, audit |
| `api/src/services/groups.js` | Groups and the closure-table hierarchy |
| `api/src/services/collections.js` | Collections |
| `api/src/services/grants/` | Grants, presets, access-type ordering |
| `api/src/services/access_requests/` | Access requests and review |
| `api/src/services/restrictions.js` | The restriction layer |
| `api/src/services/resources.js` | Resource identity and scopes |

When a file's half is unclear, `git log --diff-filter=A -- <path>` settles it. The legacy
code dates from 2023; the groups work starts in February 2026.

## Which way dependencies may point

**v2 may use shared infrastructure.** `@/db`, `@/constants`, `@/services/logger`,
`@/services/auth`, `@/services/workflow`, and `@/services/fileGraph` are common ground.

**v2 must not call a legacy domain service.** `datasets_v2` importing `services/dataset.js`
re-couples the halves and defeats the split, because the legacy module cannot then be
deleted at cut-over. This holds for tests too: a test of v2 behaviour that imports
`@/services/dataset` is exercising the wrong layer and will keep passing after the v2 code
breaks.

**v1 must not call v2.** The legacy half is frozen. It gets bug fixes, not features.

## What v2 requires that the schema does not

A constraint only v2 needs cannot sit on a column v1 writes, because both halves write the
same tables. The requirement belongs in the v2 service and route instead.

`dataset.owner_group_id` is the worked example. Migration
`20260908010000_dataset_owner_group_required` made it `NOT NULL`, which broke all three
legacy creation paths at once — they send no owning group, so they began failing at the
database level rather than returning a useful error. Migration
`20260909010000_dataset_owner_group_nullable` dropped the constraint again.

The requirement now lives one layer up. `buildDatasetCreateQuery` in
`api/src/services/datasets_v2/create.js` throws when there is no `owner_group_id`, and
`POST /v2/datasets` validates it. A dataset created through v2 always has an owning group;
one created through a legacy route may not.

The `Unassigned Datasets` group and its backfill stay as they are. Rows already moved there
keep their owner. The group is still where a dataset with no owner belongs once somebody
assigns one.

## Shared tables need a v1 story

Every v2 table that a legacy route writes to needs an answer for the rows v1 produces:

- **`dataset.owner_group_id`** — null for legacy rows. They fall outside the ownership path,
  so `searchDatasetsForUser` does not return them to anyone but a platform admin.
- **`resource`** — `dataset.resource_id` is `NOT NULL` with no database default, and nothing
  populates it on insert. `datasets_v2/create.js` creates the resource row as a nested
  create. The legacy paths do not, which is a second reason legacy creation currently fails.
- **`grant`** — a dataset created through v2 gets a seeded grant seating its owning group.
  A legacy dataset gets none, which is consistent: it has no owning group to seat.

## The cut-over

**Step 1 — stop the legacy routes.** Remove them from `api/src/routes/index.js`. They become
unreachable in one commit, and that commit is trivially revertible. Nothing is deleted.

**Step 2 — assign the orphans.** Every dataset with a null `owner_group_id` needs one. They
are visible to platform admins in the `Unassigned Datasets` group and through a direct query.
Seed each an owning-group grant as it is assigned.

**Step 3 — restore the constraint.** Re-apply `SET NOT NULL` on `dataset.owner_group_id`
once no route can write a row without it, and drop the throw from
`buildDatasetCreateQuery` in favour of the database check.

**Step 4 — delete the legacy code**, gradually, once nothing imports it.

### Before step 1 can happen

The legacy routes are still the only way a dataset gets created in production, so v2 has to
cover all three creation paths first. `POST /v2/datasets` covers the single-dataset case.
Bulk registration and the upload flow do not have v2 routes yet, and the workers still call
the legacy endpoints, so they need a coordinated release.

## Related

- [Groups design](./groups/design.md) — how the access model works
- [Groups decisions](./groups/decisions.md) — why it is shaped that way
- [Dataset creation](./groups/dataset-creation.md) — the routes a dataset arrives by
