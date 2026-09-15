---
title: Dataset Creation Plan
order: 1
status: active
implemented: partial
last_verified: 2026-09-08
---

# Building import and upload for groups

This page is the ordered plan for giving groups their own import and upload paths. It says
what gets built, in what order, and which layer each piece belongs to. The reasoning behind
the shapes chosen here lives in [Dataset creation](../dataset-creation.md); this page does not
repeat it.

The work splits into four features. Feature S changes the naming constraint and the storage
layout, and ships first and by itself, because nothing else can be built on paths that are
about to move. Feature A is then the common ground both halves stand on, and nothing in it is
visible to a user on its own. Feature B is import, and Feature C is upload. Import is usable
end to end when B4 lands, and upload when C5 lands.

Every phase leaves the tree working. No phase edits an existing upload or import service.
Feature S is the one place legacy code may be edited at all, and the reason is given there.

## Nothing retires v1

The legacy steppers, pages, routes, and services keep working in parallel throughout. New
modules are added beside them; none is replaced.

Three constraints in this plan can only be finished by the cut-over, and each is recorded in
[v2 cut-over](../../v2-cutover.md) under *What only the cut-over may do*: a unique
`origin_path`, retiring the legacy `exists` route, and deleting the two small pieces of logic
that this plan copies rather than shares.

Feature S is the exception, and it is an approved one. It edits legacy code because storage
layout and the naming constraint are shared substrate rather than a v2 feature. Legacy
behaviour is unchanged, which is the condition that made it acceptable.

## What each layer contributes

**The workers need almost no new code.** Import starts a workflow through a v2 route that
already exists. Upload post-processing is driven by `dataset_upload_log`, not by whichever
service created the dataset. The one worker change is A4, which puts a group directory into
the archive, bundle, and QC paths.

**The API is where most of the new code goes.** Only the create call has to be rewritten.
Everything downstream keys on `dataset_upload_log.dataset_id` and `dataset.origin_path`, and
never on who wrote the row. The TUS server, the upload-log routes, `uploadLogService.js`,
`sidecarUtils.js`, `tusUtils.js`, `manage_upload_workflows.py`, the `verify_upload_integrity`
task, and the `integrated` workflow are all reused unchanged.

**The UI is a rebuild rather than a port.** `UploadDatasetStepper.vue` is 2,077 lines and
`ImportStepper.vue` is 1,295. Both are full-page steppers over v1 services in the pre-v2
visual language. Logic carries over and markup does not: the tus-js-client loop, the BLAKE3
checksum service, the directory-typeahead behaviour, and the upload status vocabulary.
`CollectionCreateModal.vue` is the structural template.
[V2 design system](../../../contributing/v2-design-system.md) and
[V2 page patterns](../../../contributing/v2-page-patterns.md) govern the rest. The screens are
drawn in [the mockups](/mockups/dataset-creation-screens.html).

**Two pieces get copied rather than shared.** The `origin_path` format
`<host_dir>/<subdir>/<id>/<name>` and the import-source prefix check are both inline in
legacy route bodies rather than in services. Copying them into the v2 services preserves the
rule that no existing service is edited. The `origin_path` format is fixed by data already on
disk, so the copy cannot drift.

**New modules take a `v2` name only where one collides.** `services/datasets_v2/uploads.js`
collides with `services/upload/`, and `routes/datasets_v2/imports.js` with
`routes/datasets/imports.js`. The suffix marks a collision, not a version, which is the rule
in [`v1-v2-coexistence`](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v1-v2-coexistence/SKILL.md).

## Feature S — Group-scoped names and the storage layout

**Shipped 2026-09-08.** Each phase below is done; the section is kept because it is the record
of what changed and why.

This shipped **before** Features A, B, and C, and by itself. It changes the naming constraint on
`dataset` and every storage path derived from a dataset name. Nothing in import or upload can
be built on a layout that is about to move.

**This feature may edit legacy code**, which nothing else in this plan may do. Storage layout
and the naming constraint are single facts about the system, so there is no way to give the
legacy half one layout and the new half another. The seeded default group is what makes the
edit safe: a legacy caller passes no group, lands in `Unassigned Datasets`, and behaves
exactly as before. [Dataset storage](../dataset-storage.md) is the design record.

Data is disposable throughout. The development database is reseeded rather than migrated in
place where that is simpler.

### S1 — The `Unassigned Datasets` group and `group.archive_key`

`group` gains `archive_key`, unique and not null, derived from the slug at creation and never
updated. `slug` is regenerated on rename, so an archive layout built on it would fragment the
first time a group is renamed.

The migration seeds an `Unassigned Datasets` group at a fixed id, with no members and
`allow_user_contributions` false. Creating a group requires a `subject` row first, because
`group.id` is a foreign key to `subject.id`.

### S2 — `dataset.owner_group_id` becomes NOT NULL with a default

The migration backfills existing nulls to the seeded group, sets the column default to that
group's id, and then makes the column `NOT NULL`. Order matters within the migration.

`datasets_v2/create.js` still throws without an explicit group, so v2 never reaches the
default by accident. The default exists for legacy callers only.

### S3 — The unique key becomes per group

`@@unique([name, type, is_deleted])` becomes `@@unique([owner_group_id, name, type,
is_deleted])`.

One call site reads the old compound key: the legacy `exists` route at
`api/src/routes/datasets/index.js:1143`, which does a `findUnique` on
`name_type_is_deleted`. It becomes a `findFirst` on the same three fields, which preserves its
current meaning exactly — it answers whether any dataset anywhere holds the name.

### S4 — Storage paths carry the group or the alias

Six paths change, and none of them may keep a bare dataset name.

- **Archive:** `<archive>/<archive_key>/<name>.tar`. Readable, because a recovery reads it
  without the database.
- **QC report:** `<qc>/<archive_key>/<name>/qc`. Same reason, same shape.
- **Bundle under construction:** `<generate>/<id>.tar`. A local temp file nobody reads. This
  decouples the local filename from the tape object name, which `archive()` currently
  conflates by deriving the tape path from `bundle.name`.
- **Bundle fetched from tape:** `<bundle stage>/<stage_alias>.tar`. Also local and transient.
- **Extracted tree:** `<stage>/<stage_alias>/<name>`. Already alias-keyed; unchanged.
- **Bundle download symlink:** `<download>/bundles/<stage_alias>/<name>.tar`. The alias
  directory supplies uniqueness and the last segment stays readable, because the browser names
  the saved file from it.

The bundle download symlink was `<download>/<name>.<type>.tar`. The `.{type}` suffix existed
to separate two types of the same name in one shared download directory. It does not survive
two groups holding the same name and type, and it is redundant in the bundle staging
directory, which is already per type.

### S5 — The API builds the same download path

`services/datasets_v2/files.js` calls `datasetService.getBundleName`, which is defined
nowhere, so `GET /v2/datasets/:id/bundle/download` throws a `TypeError` today. Both halves
gain a single helper returning `bundles/<stage_alias>/<name>.tar`, and the legacy route at
`api/src/routes/datasets/index.js:1075` uses it too.

### S6 — `dataset.archive_group_key`

Stamped from the owning group when the archive is written, beside `archive_path`, and never
recomputed. It records who owned the dataset when the bundle was written, which the current
`owner_group_id` no longer answers once a transfer is possible.

### S7 — Ownership transfer rules

No transfer route exists yet. These are the rules one must obey, written down before it is
built.

A transfer changes `owner_group_id` and moves no bytes. It checks the name is free in the
target group first, because the unique key can reject it. Re-archival after a transfer deletes
the object at the recorded `archive_path` before writing the new one, or that object is
referenced by nothing and stays on tape forever.

### S8 — Reseed and verify end to end

Reseed the development database, then run a dataset of the same name and type through the
`integrated` workflow under two different groups. Both must reach STAGED with distinct archive
objects, distinct staged trees, and distinct download links.

## Feature A — Common work

### A1 — A `contribute` action on the dataset policy

`dataset.create` is `isDatasetOwningGroupAdmin`, so a member of a contributing group can
create nothing. Add `contribute: Policy.or([isDatasetOwningGroupAdmin,
isMemberOfContributingGroup])` to `api/src/authorization/builtin/policies/dataset.js`. The
second policy needs a `member` path to the owning group, read from the context attribute
`access_paths`, and `resource.owner_group_allows_contributions`, and both are hydrated already. `dataset.create` keeps its meaning, so the existing v2 routes are
unaffected.

*Reuse:* the policy framework, both hydrators. *New:* one policy, one action.

### A2 — Eligible owning groups

`services/datasets_v2/ownership.js` exports `listEligibleOwnerGroups(user)` behind
`GET /v2/datasets/eligible-owner-groups`. A platform admin sees every active group, a group
admin sees the groups they administer, and a member sees groups where
`allow_user_contributions` is true. Each row says which rule admitted it.

Two groups are never eligible. `Public` and `Authenticated Users` are rows in the group table
so a grant can name them as a subject, but neither has members nor a place in the hierarchy,
so neither can own data. `listGroups` already excludes them for the same reason.

Excluding them from the list alone is not enough, because a platform admin passes the
`dataset.contribute` check against any group. `getOwnerGroupForAuthorization` refuses them as
well, and every v2 creation route — create, import, and upload — resolves its owning group
through that one call, so the refusal covers all three.

*Reuse:* the search helpers in `services/groups.js`, the hydrators. *New:* one service, one
route.

### A3 — Name availability without an oracle

The v2 creation routes answer 409 saying the name is unavailable, never that a dataset holds
it. Add `GET /v2/datasets/name-available`, scoped exactly as the creation routes are. Do not
reuse `GET /datasets/:type/:name/exists`, which answers for any name in the system and is
open to every `user` role.

*Reuse:* `normalize_name`. *New:* one route. *Untouched:* the legacy `exists` route, still
called by the legacy steppers.

### A4 — Nothing; the naming work is Feature S

Per-group dataset names and the storage layout moved to [Feature S](#feature-s-group-scoped-names-and-the-storage-layout),
which ships first and on its own. The numbering is kept so references elsewhere still resolve.

### A5 — The owning-group picker

`components/v2/datasets/create/OwnerGroupSelect.vue`, backed by A2. Zero eligible groups
blocks submission with a plain message. One group auto-selects and names itself. Several
require a choice. The picker preselects the group whose page the user is on.

*Reuse:* `AdminGroupSearchSelect.vue` is the precedent this generalises, plus `GroupIcon` and
`AutoCompleteSearch`. *New:* one component, one service method.

### A6 — The chooser

`components/v2/datasets/create/AddDatasetModal.vue` offers import and upload as two cards,
each with an icon and a one-line description. The distinction is stated plainly: import
registers data already on disk and copies nothing, upload sends files from this browser.

*Reuse:* the modal pattern, with `CollectionCreateModal.vue` as the structural template.
*New:* one component.

### A7 — Entry points

There are two, and they differ only in whether the group is already known.
`navigateToCreateDataset()` in `ui/src/components/v2/groups/GroupDatasetsTab.vue:268` is an
empty `// TODO`; point it at A6 with the tab's group preselected. Add a "New Dataset" button
to `pages/v2/datasets/index.vue`, matching the "Create Collection" button on the collections
list, opening the same modal with the group selectable.

*Reuse:* the group tab's button and its `canCreate` gating, and
`pages/v2/collections/index.vue` as the pattern for the list-page button. *New:* one button,
one handler.

*Collections are not an entry point.* A collection holds datasets that already exist, and its
page cannot answer which group should own a new one.

## Feature B — Import

Import registers a directory that already exists on a filesystem the API can read. Nothing is
copied.

### B1 — Import sources belong to a group and have a lifecycle

`import_source` gains `owner_group_id`, a `status` of `ACTIVE`, `SUSPENDED`, or `RETIRED`,
`requested_by_id`, `approved_by_id`, `approved_at`, and `path_verified_at`. A source is never
deleted, because datasets imported from it still hold paths underneath it and their
provenance would be lost. `GET /v2/import-sources` returns the `ACTIVE` and `SUSPENDED`
sources owned by a group the caller belongs to, has oversight of, or administers.

*Registration, for now:* a group admin emails a platform admin, who confirms the path is
readable by the API and the workers, then inserts the row as `ACTIVE`. A request and approval
flow is deferred. The schema is shaped so that adding it means adding a `PENDING` status and
a review screen, and nothing else.

*New:* one migration, one route, one service. *Untouched:*
`GET /datasets/imports/sources`.

### B1a — A source that cannot be read says so

A scheduled check confirms each active source's path is readable and stamps
`path_verified_at`. A failure moves the source to `SUSPENDED` with the reason. Today an
unmounted path returns an empty listing, which a user reads as "my data is gone".

*New:* one worker script or cron entry.

### B2 — Group-scoped filesystem browsing

`GET /v2/fs` resolves a requested path against the caller's own sources rather than against
every row. Scoping the list without scoping the browse is decoration, because the contents
are still served to a guessed path.

*Reuse:* the directory-walking and extension-filter logic in `routes/fs.js` is sound, and can
be lifted into a service both routes call. *New:* one route, one resolver. *Untouched:*
`GET /fs`.

### B3 — The import route

`POST /v2/datasets/imports` and `services/datasets_v2/imports.js`. The route re-checks
`origin_path` against the caller's sources, refuses when a live dataset already holds that
path without naming the dataset or its group, creates through `datasets_v2/create.js`, and
starts the `integrated` workflow. It authorizes with `contribute`.

*Reuse:* `datasets_v2/create.js`, and
`POST /v2/datasets/:id/workflows/run/:workflow_type`. *New:* one route, one service.
*Workers:* nothing.

### B4 — The import dialog

`components/v2/datasets/create/ImportDatasetModal.vue` asks for source, directory, name,
type, and owning group. The directory field is a typeahead over `GET /v2/fs`. There are no
project or instrument fields.

*Reuse:* `AutoCompleteSearch`, A5's picker, the modal pattern. The behaviour of
`FileListAutoComplete.vue` is the reference, including that its watcher only fires while the
dropdown is open. *New:* one component, rebuilt in the v2 idiom.

**Import is usable end to end when this lands.**

## Feature C — Upload

Upload sends files from the browser. It is the only route here that moves bytes.

### C1 — The upload route

`POST /v2/datasets/uploads` and `services/datasets_v2/uploads.js`. The route creates the
dataset through the v2 pair, computes the deterministic `origin_path`, and creates the
`dataset_upload_log` row, all in one transaction. It authorizes with `contribute`. Add
`GET /v2/datasets/:id/upload-log` as well, because the v1 read routes are gated by RBAC and a
contributor is not an administrator.

*Reuse unchanged:* the TUS server in `services/upload/UploadService.js`,
`POST /datasets/uploads/:id/complete`, `PATCH /datasets/uploads/:id/upload-log`,
`uploadLogService.js`, `sidecarUtils.js`, `tusUtils.js`, and `TestableFileStore.js`. Each one
keys on `dataset_upload_log.dataset_id` and `dataset.origin_path`. *New:* two routes, one
service. *Workers:* nothing.

### C2 — The browser client

`services/v2/upload.js` holds the tus-js-client loop as a plain function over a file list. It
handles per-file metadata (`dataset_id`, `selection_mode`, `relative_path`,
`directory_name`), retry, and a progress callback. This is roughly eighty lines currently
buried in `UploadDatasetStepper.vue`, copied out, with the original left in place.

*Reuse unchanged:* `services/upload/checksum.js` and `_getUploadServiceURL`. `tus-js-client`
and `hash-wasm` are already dependencies. *New:* one service module.

### C3 — The transfer runs from a store, not a component

`stores/v2/upload.js` owns the in-flight transfers. The dialog registers the dataset, hands
the files to the store, and closes. Navigation is then free, because this is a single-page
application and state outside a component survives a route change. The legacy stepper blocks
navigation with `onBeforeRouteLeave` only because every `tus.Upload` object lives in component
state.

A reload still ends a transfer, and always will. A `File` handle cannot outlive the document,
and `storeFingerprintForResuming` is off because large sessions exceeded the browser's
storage quota. `beforeunload` still warns.

*New:* one store, and one persistent progress indicator in the app chrome. *Reuse:* C2's
transfer function unchanged.

### C4 — The upload dialog

`components/v2/datasets/create/UploadDatasetModal.vue` asks for files or a directory, name,
type, and owning group. It says plainly that the transfer continues if the dialog is closed,
and stops if the page is reloaded.

*Reuse:* A5's picker, the modal pattern, C3's store. *Rebuilt:* `SelectedFilesTable.vue` and
`DatasetFileUploadTable.vue` in the v2 idiom.

### C5 — Watching an upload afterwards

Per dataset, an Upload tab on `pages/v2/datasets/[id]/` reads `GET /v2/datasets/:id/upload-log`.
It appears only when `create_method` is `UPLOAD`, and it says what each status means in the
words someone waiting on their own upload would use. Across datasets, an upload-state filter
on the v2 datasets list replaces a parallel uploads page like the legacy `/datasets/uploads/`.

*Decided while building.* Three things.

The filter takes a group name, not a raw status. `UPLOAD_STATUS_GROUPS` in `api/src/constants.js`
collapses the ten statuses into `IN_PROGRESS`, `FAILED`, and `COMPLETE`, which are the three
answers a person wants from a listing. `ANY` returns every uploaded dataset whatever became of
it, and a single status is still accepted for a caller that wants one. A test asserts the three
groups cover every status exactly once, so a status added to the enum cannot ship unclassified.

The deleted-row default is dropped when the filter is on. `GET /v2/datasets` hides deleted
datasets unless asked. A terminally failed upload is tombstoned — renamed and marked deleted —
so that default would hide exactly the rows the person who uploaded needs to see. The route
applies the default only when `upload_status` is absent.

The listing shows the upload's own state while the filter is on. `include_upload_log` adds the
log to each row, and the status column shows the upload status in place of the usual
active-or-archived badge. Without it a tombstoned failed upload reads only as "Archived", which
hides the failure the filter was used to find.

*Reuse:* the status vocabulary in `UploadStatusBadge.vue` and `UploadStatusIcon.vue`.

**Upload is usable end to end when this lands.**

## Testing

Each new v2 service gets lifecycle and invariant tests beside the existing
`tests/services/datasets/`. A test that creates a dataset through a v2 service must delete
its grants before deleting the resource, because `grant.resource` is `ON DELETE RESTRICT`.

## Already done

`POST /v2/datasets/bulk` and `workers/workers/scripts/watch_v2.py` shipped on 2026-09-08.
The bulk route takes up to a hundred datasets, each carrying its own `owner_group_id` in the
shape the single-create route accepts, and authorizes once per distinct group through
`authorizeAction`. Registration config is keyed by ingestion directory rather than by dataset
type. [Dataset creation](../dataset-creation.md#route-1-the-watch-script) describes the
result.

Deployment note: every `/v2` route reads `subject_id` from the caller's JWT, and the workers'
`APP_API_TOKEN` predates that claim. It must be reissued before the workers can call any v2
route.
