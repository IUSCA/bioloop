---
title: v1 and v2 coexistence techniques
---

# v1 and v2 coexistence techniques

This page holds the background behind the `v1-v2-coexistence` skill
(`.claude/skills/v1-v2-coexistence/SKILL.md`). The design record is
[Building v2 alongside v1](../../design/v2-cutover.md). It states the additive rule, which way
dependencies may point, the shared-table stories, and the carve-outs already granted. This page does
not repeat it.

## Telling the halves apart

The `_v2` suffix marks a name collision, not a version. These modules carry it:

| v2 module | Legacy module it collides with |
|---|---|
| `api/src/services/datasets_v2/` | `api/src/services/dataset.js` |
| `api/src/routes/datasets_v2/` | `api/src/routes/datasets/` |
| `api/src/routes/users_v2/` | `api/src/routes/users.js` |
| `api/src/routes/fs_v2.js` | `api/src/routes/fs.js` |

`api/src/services/fs_v2.js` also carries the suffix.

Modules added for the groups work with no collision have plain names and are still v2. Examples are
`api/src/authorization/`, `api/src/state/`, `services/groups.js`, `services/collections.js`,
`services/resources.js`, `services/grants/`, `services/access_requests/`, `services/hooks/`, and the
matching `routes/` files.

Git settles a file's half. Legacy code dates from 2023, and the groups work starts on 2026-02-24.

```bash
git log --diff-filter=A --format='%h %ad %s' --date=short -- <path> | tail -1
```

## The two `buildDatasetCreateQuery` functions

One lives in `api/src/services/dataset.js`, and one lives in `api/src/services/datasets_v2/create.js`.
They take similar arguments and build similar Prisma queries. Both are reachable. The legacy routes
in `routes/datasets/index.js` and `routes/datasets/uploads.js` call the v1 function. `POST /v2/datasets`
and `services/datasets_v2/imports.js` call the v2 function.

Editing the wrong one is silent, because each still works for the routes that call it. Decide from
the call sites.

## v2 code that no route reaches

A v2 service can exist before its route does. Unreachable is not wrong. The cost is that nothing
validates it, so a bug sits until the route is wired. Two traps surfaced this way and still apply.

**A sub-router needs `mergeParams`.** `express.Router()` does not inherit `:dataset_id` from its
parent. Without `express.Router({ mergeParams: true })`, every handler authorizes and queries against
`undefined`. Check this first when a sub-router answers 500 on a `where` clause full of `undefined`.
`routes/datasets_v2/files.js` and `workflows.js` both set it.

**A nested relation create flips Prisma into relation form.** `datasets_v2/create.js` creates the
`resource` row as a nested `resource: { create: ... }`, because `dataset.resource_id` is `NOT NULL`
with no database default. Once a nested create is present, a sibling scalar foreign key such as
`owner_group_id` is rejected with `Unknown argument`. Use `owner_group: { connect: { id } }`. The
error names the argument, so it reads as a misspelling.

## Constraints only v2 needs

Both halves write the same tables. A constraint only v2 wants therefore goes in the v2 service and
route, not on the column.

`dataset.owner_group_id` shows the shape. The column is `NOT NULL` with a database default naming
the seeded `Unassigned Datasets` group, so a legacy insert that names no group lands there.
`buildDatasetCreateQuery` in `datasets_v2/create.js` throws without an `owner_group_id`, and
`POST /v2/datasets` validates it with `isUUID()`. So v2 never relies on the default.

## Shared substrate

A shared-substrate change is one where both halves must agree on one value, such as a path format, a
uniqueness rule, or a column every writer populates. [Building v2 alongside v1](../../design/v2-cutover.md)
lists the carve-outs granted so far and the reasons each is safe.

Group-scoped dataset names show the size of edit to expect in legacy code.

- The legacy `/:datasetType/:name/exists` route uses `findFirst` and keeps its global meaning.
- The legacy `get_dataset` service selects `owner_group.archive_key`, because the workers build
  paths from it.
- `get_bundle_name` returns `${dataset.name}.tar`, with no `.{type}` segment.

None of these changes what a legacy caller observes.

A granted carve-out edits the legacy file generically. The `createUser` hook is the model: the legacy
function runs whatever handlers are registered for an event, and the feature registers itself from
the v2 side in `services/hooks/subscribers.js`.

## Tests

A test of v2 behaviour imports the v2 module. A test that imports `@/services/dataset` pins the v1
function and keeps passing after the v2 one breaks.
`tests/services/datasets/dataset.use-conditions.test.js` imports from `@/services/datasets_v2`.

Creating a dataset or collection through a v2 service seeds a grant, and `grant.resource` is
`ON DELETE RESTRICT`. Teardown deletes the grants before the resource. `deleteDataset`,
`deleteCollection`, and `deleteGrantsForResource` in `tests/services/helpers.js` do this.
