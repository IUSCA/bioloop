---
name: v1-v2-coexistence
description: How to tell bioloop v1 (legacy) code from v2 (groups/ABAC) code, and which half a change belongs in. Use before editing anything under api/src/services, api/src/routes, or api/prisma/schema.prisma, and whenever adding a feature that touches datasets, groups, collections, grants, or access requests.
---

# Which half am I editing?

The design record is [docs/design/v2-cutover.md](../../../docs/design/v2-cutover.md). Background,
examples, and the module table are in
[docs/contributing/techniques/v1-v2-coexistence.md](../../../docs/contributing/techniques/v1-v2-coexistence.md).
This skill keeps the rules and the traps.

**The rule in one line: a v2 feature is written in v2 code, even when no route reaches it yet.**
The temptation is always the same. The v1 function is the one that runs, so the change goes into
v1 "for now". That is the mistake. Write the v2 code and record the missing route in `.todo/`.

## Rules

- **The `_v2` suffix marks a name collision, not a version.** `services/datasets_v2`,
  `routes/datasets_v2`, `routes/users_v2`, and `fs_v2` carry it. Plain-named groups modules are v2
  too: `src/authorization/`, `src/state/`, `services/groups.js`, `services/collections.js`,
  `services/resources.js`, `services/grants/`, `services/access_requests/`, `services/hooks/`.
- **Ask git, do not guess.** Legacy code dates from 2023; the groups work starts 2026-02-24.

  ```bash
  git log --diff-filter=A --format='%h %ad %s' --date=short -- <path> | tail -1
  ```

- **v2 must not call a legacy domain service.** Shared infrastructure (`@/db`, `@/constants`,
  logger, auth, workflow, fileGraph) is fine. `datasets_v2` importing `services/dataset.js` is not.
- **Do not retire, migrate, or repoint v1 code in a v2 change.** Write the needed change into
  `docs/design/v2-cutover.md` under what only the cut-over may do.
- **A constraint only v2 needs goes in the v2 service and route, not on the column.** Both halves
  write the same tables. `buildDatasetCreateQuery` in `datasets_v2/create.js` throwing without
  `owner_group_id` is the pattern.
- **Shared substrate is granted, never inferred.** A change qualifies only when both halves must
  agree on one value: a path format, a uniqueness rule, a column every writer populates. A feature
  that is merely easier to write in v1 does not. Ask first.
- **A granted carve-out edits v1 generically.** Add a neutral extension point, such as the
  `createUser` hook, and keep the feature in v2 code that registers itself.
- **A test of v2 behaviour imports the v2 module.** A test importing `@/services/dataset` pins v1
  and keeps passing after v2 breaks.

## Traps

**There are two functions named `buildDatasetCreateQuery`.** One is in `services/dataset.js`, one in
`services/datasets_v2/create.js`, and routes call both. Editing the wrong one is silent. This has
landed a v2 feature in the v1 file twice. Before editing either, run:

```bash
grep -rn "buildDatasetCreateQuery" api/src --include=*.js
```

and decide from the call sites, not from which file your editor opened.

**A sub-router without `mergeParams` sees `undefined` params.** `express.Router()` does not inherit
`:dataset_id`. Check for `express.Router({ mergeParams: true })` first when a sub-router 500s on a
`where` clause full of `undefined`.

**A nested relation create rejects sibling scalar foreign keys.** Once
`resource: { create: ... }` is present, `owner_group_id` fails with `Unknown argument`. Use
`owner_group: { connect: { id } }`. The error reads like a misspelling.

**Grants pin their resource.** Creating a dataset or collection through a v2 service seeds a grant,
and `grant.resource` is `ON DELETE RESTRICT`. Teardown uses `deleteDataset`, `deleteCollection`, or
`deleteGrantsForResource` from `tests/services/helpers.js`, which delete grants first.

The `api-tests` skill covers the rest of the test conventions, including the `__basedir` depth trap
and the mandatory `--runInBand`.

## Keeping this current

Amend this file whenever you hit something it does not mention: a new `_v2` module, another
duplicated function name, another constraint that had to move up a layer, or another v2
service that turns out to be unreachable. Record dead ends explicitly — the "I edited the
wrong `buildDatasetCreateQuery`" note above is here because it happened twice, and the
second time cost as much as the first. Put background and examples in
[docs/contributing/techniques/v1-v2-coexistence.md](../../../docs/contributing/techniques/v1-v2-coexistence.md).
