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

## Shared UI components need a v1 story

Some Vue components serve both halves. `components/filebrowser/` is the clearest case: the
legacy dataset and project pages use it, and so does the v2 `DatasetFilesTab`.

`FileBrowser` already handles this. It takes `listFiles` and `searchFiles` as function props
that default to the v1 service, so a legacy page passes nothing and behaves as it always did,
while `DatasetFilesTab` passes the v2 functions. **Extend that pattern rather than forking a
component or repointing it.** A new prop with a v1 default leaves every legacy caller
byte-identical in behaviour.

`FileTable`, one level below, does not follow the pattern: it imports the v1 dataset service
directly and calls `get_file_download_data`. That is why file downloads run through the legacy
route even on a v2 page, and so are not grant-checked. Giving it a `downloadFileInfo` prop with
a v1 default closes that hole for v2 without touching v1's path.

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

The legacy routes are still the only way most datasets get created in production, so v2 has
to cover every creation path first. All four paths now have one. `POST /v2/datasets` covers
the single-dataset case, `POST /v2/datasets/bulk` covers scanned registration,
`POST /v2/datasets/imports` covers a directory already on disk, and
`POST /v2/datasets/uploads` covers a transfer from a browser. Each has a dialog behind it and
each has been run end to end through the UI.

What remains before step 1 is not a missing route. It is confidence that the v2 paths carry
the traffic: the watch script running on v2 in production, the legacy steppers unused for
long enough to say so, and the orphan datasets of step 2 identified.

**Both halves run in parallel until then, and neither is touched to help the other.** The
legacy steppers, the `/datasets/imports/new` and `/datasets/uploads/new` pages, and the
routes behind them keep working unchanged while the v2 equivalents run beside them. A user
can create a dataset either way, and the two produce rows that differ only in whether an
owning group and a seeded grant are present.

### Done ahead of the cut-over: per-group dataset names

Scoping `@@unique([name, type, is_deleted])` to the owning group looked like cut-over work,
because it needed every legacy row to have a group. A database default supplied that instead.
`dataset.owner_group_id` is `NOT NULL` defaulting to the seeded `Unassigned Datasets` group,
so a legacy insert that names no group lands there and behaves exactly as before.

That made the change safe to apply while v1 is live, and it is applied. The storage paths
moved with it, because a name-keyed archive path loses data the moment two groups share a
name. [Dataset storage](./groups/dataset-storage.md) is the record.

One of three places the groups work has edited legacy code, and the reason is that storage layout
and the naming constraint are shared substrate rather than a v2 feature. Legacy behaviour is
unchanged.

### Done ahead of the cut-over: a lifecycle hook in `createUser`

Group invitations need one thing from v1: when an account is created, that address's pending
invitations must be applied in the same transaction. There is one signup flow in the system and
no v2 equivalent, so "write it in the v2 module" has no meaning here. Building a second signup
would mean duplicating OAuth.

The edit is deliberately generic. `services/user.js` wraps its existing work in a transaction
and runs whatever handlers are registered for `USER_CREATED`, passing the row and the
transaction client. It names nothing about invitations, imports nothing from the v2 tree, and
reads the same whether the feature exists or not. The invitation handler registers itself from
the v2 side, in `services/hooks/subscribers.js`.

**No legacy call site was edited.** `routes/users.js`, `routes/auth/signup.js`, and the
auto-signup branch in `services/auth.js` are unchanged and all three gained the behaviour. With
no invitations in the table the handler does nothing, so legacy behaviour is unchanged.

This is the shape a granted carve-out should take: an extension point in the old code, and the
feature itself somewhere else. It is not a precedent for editing v1 generally.
[Invitations](./groups/invitations.md) is the record.

### Done ahead of the cut-over: a text-size setting on the profile page

A user's text-size choice needs a home on the profile page, and the only profile page is
legacy. The feature lives in the v2 tree. `components/v2/preferences/FontSizeSelector.vue`
renders the choice, and `composables/useFontSize.js` saves it and applies it.

Two legacy files each gained an import and one line. `pages/profile.vue` mounts
`<FontSizeSelector>`, and `App.vue` calls `applyFontSize()`. Neither knows the sizes, the
storage key, or how the size is applied. With nothing saved, the root font size stays at the
browser default, so legacy behaviour is unchanged.

A replacement profile page must mount `FontSizeSelector`. A replacement app shell must keep the
`applyFontSize()` call. [V2 design system](../contributing/v2-design-system.md#typography) is
the record.

### What only the cut-over may do

Some fixes the v2 work identifies cannot be applied while v1 is live, because v1 writes the
same tables. They wait for step 1, and they are listed here so they are not attempted early.

- **A unique constraint on `dataset.origin_path`.** The v2 import service refuses a duplicate
  in application code. The database cannot enforce it while the legacy routes can still
  insert one, and nothing has audited whether duplicates already exist.
- **Retiring the legacy `exists` route.** `GET /datasets/:type/:name/exists` answers for any
  name in the system. The v2 dialogs call a scoped endpoint instead, and the legacy route
  stays until the legacy steppers stop calling it.
- **Making `import_source.owner_group_id` required.** It is nullable so a source with no
  group remains reachable through the legacy browse routes.
- **Retiring the legacy download routes.** `GET /datasets/:id/files/:file_id/download_info`
  and the bundle equivalent authorize through the old RBAC middleware, so a download taken
  there is not grant-checked. They stay until the legacy file browser pages stop calling them.
  The v2 routes enforce the `dataset.download` grant, and shared components reach them through
  a prop rather than by being repointed.
- **Restricting `/workflows`.** The global run list requires the v1 `operator` and `admin`
  roles. At cut-over that becomes a platform-admin check like every other v2 surface.
- **Fixing `api/src/scripts/delete_datasets.js`.** It hard-deletes datasets and now fails the
  foreign key, because creating a resource through v2 seeds an owning-group grant and
  `grant.resource` is `ON DELETE RESTRICT`. The fix is to delete grants first. It is a legacy
  developer script, so it waits rather than being repaired inside a v2 change.

@see docs/design/groups/dataset-creation.md — What groups break that was safe when everything
was global

## Related

- [Groups design](./groups/design.md) — how the access model works
- [Groups decisions](./groups/decisions.md) — why it is shaped that way
- [Dataset creation](./groups/dataset-creation.md) — the routes a dataset arrives by
