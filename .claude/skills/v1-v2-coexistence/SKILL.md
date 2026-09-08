---
name: v1-v2-coexistence
description: How to tell bioloop v1 (legacy) code from v2 (groups/ABAC) code, and which half a change belongs in. Use before editing anything under api/src/services, api/src/routes, or api/prisma/schema.prisma, and whenever adding a feature that touches datasets, groups, collections, grants, or access requests.
---

# Which half am I editing?

The design record is [docs/design/v2-cutover.md](../../../docs/design/v2-cutover.md).
This skill is the operational half: how to work out which file a change belongs in, and
the traps that have already cost time.

**The rule in one line: a v2 feature is written in v2 code, even when no route reaches it
yet.** The temptation is always the same — the v2 function is unreachable, the v1 function
is the one that actually runs, so the change goes into v1 "for now". That is the mistake.

## Deciding which half a file is in

The `_v2` suffix marks a **name collision**, not a version. Only two modules have one:
`services/datasets_v2` (against `services/dataset.js`) and `routes/datasets_v2` and
`routes/users_v2` (against `routes/datasets/` and `routes/users.js`).

Everything else added for the groups work has a plain name and is still v2:
`src/authorization/` entirely, `services/groups.js`, `services/collections.js`,
`services/restrictions.js`, `services/resources.js`, `services/grants/`,
`services/access_requests/`, and the `routes/` files matching those.

When in doubt, ask git rather than guessing:

```bash
git log --diff-filter=A --format='%h %ad %s' --date=short -- api/src/services/collections.js | tail -1
```

Legacy code dates from 2023. The groups work starts 2026-02-24. That one date separates
them cleanly.

## The trap that has actually happened twice

**There are two functions named `buildDatasetCreateQuery`.** One in
`api/src/services/dataset.js`, one in `api/src/services/datasets_v2/create.js`. They take
similar arguments and build similar Prisma queries. Editing the wrong one is silent: the
v1 one is currently the only one a route calls, so a change there appears to work and a
change to the v2 one appears to do nothing.

Groups MVP phases 7 and 10 both landed in the v1 file for exactly this reason — consent-code
capture and owning-group grant seeding. Both had to be moved afterwards.

Before editing either, run:

```bash
grep -rn "buildDatasetCreateQuery" api/src --include=*.js
```

and decide from the call sites, not from which one your editor opened.

## v2 code that no route calls is normal

`api/src/services/datasets_v2/create.js` exported `createDataset` and `bulkCreateDatasets`
for months with no route calling either, because `POST /v2/datasets` was commented out.
Unreachable is not the same as wrong. Write the v2 code, and record the missing route in
`.todo/` rather than putting the logic in v1 to make it run.

The cost of that gap is that unreachable code is never validated. Two bugs sat in
`datasets_v2/create.js` until the route was finally wired:

- `create_method` was written into the `audit_logs` nested create. It is a column on
  `dataset`; `dataset_audit` has no such field.
- Nothing created the `resource` row, and `dataset.resource_id` is `NOT NULL` with no
  database default and no insert trigger. The fix is a nested
  `resource: { create: { type: RESOURCE_TYPE.DATASET } }`.

**Adding a nested relation create flips Prisma into relation form.** Once
`create_query.resource = { create: ... }` is present, a sibling scalar foreign key such as
`owner_group_id` is rejected with `Unknown argument`. Use
`owner_group: { connect: { id } }` instead. The error names the argument, not the cause,
so it reads as though the field is misspelled.

## Constraints that only v2 needs

Both halves write the same tables, so a `NOT NULL` that only v2 wants will break v1. Put
the requirement in the v2 service and route, and leave the column permissive.

`dataset.owner_group_id` is the standing example: `buildDatasetCreateQuery` in
`datasets_v2/create.js` throws without one, `POST /v2/datasets` validates it, and the
column stays nullable so the legacy routes still work. Do not re-add the database
constraint before cut-over.

## Shared substrate is the one carve-out, and it is granted rather than inferred

Storage layout and the naming constraint on `dataset` are single facts about the system.
There is no way to give v1 one archive layout and v2 another, so "write it in the v2 module"
has no meaning for them, and the additive rule does not fit.

The user approved editing legacy code for exactly one such change: group-scoped dataset names
and the storage paths that go with them. What made it acceptable was that legacy behaviour is
unchanged — `dataset.owner_group_id` is `NOT NULL` with a database default naming the seeded
`Unassigned Datasets` group, so a legacy caller that sends no group lands there and behaves
as before. See [dataset-storage.md](../../../docs/design/groups/dataset-storage.md).

The edits it took, as the shape to expect: the legacy `exists` route swapped a `findUnique`
on the dropped compound key for a `findFirst` preserving its global meaning; the legacy
`get_dataset` service began returning `owner_group.archive_key`, because the workers build
paths from it; and `get_bundle_name` in the legacy service and in the UI dropped the `.{type}`
segment. Each is small, and none changes what a legacy caller observes.

**Ask before assuming a change qualifies.** The default is still additive. A change is shared
substrate only when both halves must agree on one value — a path format, a uniqueness rule, a
column every writer populates. A feature that merely happens to be easier to write in v1 is
not.

## Tests belong to the half they exercise

A test of v2 behaviour must import the v2 module. `dataset.use-conditions.test.js`
originally imported `buildDatasetCreateQuery` from `@/services/dataset`, so it pinned the
v1 function and would have kept passing after the v2 one broke.

**Creation now seeds a grant, and `grant.resource` is `ON DELETE RESTRICT`.** Any test that
creates a dataset or collection through a v2 service must delete its grants before deleting
the resource:

```js
const d = await prisma.dataset.findUnique({ where: { id }, select: { resource_id: true } });
if (d) await prisma.grant.deleteMany({ where: { resource_id: d.resource_id } });
await prisma.dataset.deleteMany({ where: { id } });
```

The `api-tests` skill covers the rest of the test conventions, including the `__basedir`
depth trap and the mandatory `--runInBand`.

## Keeping this current

Amend this file whenever you hit something it does not mention: a new `_v2` module, another
duplicated function name, another constraint that had to move up a layer, or another v2
service that turns out to be unreachable. Record dead ends explicitly — the "I edited the
wrong `buildDatasetCreateQuery`" note above is here because it happened twice, and the
second time cost as much as the first.
