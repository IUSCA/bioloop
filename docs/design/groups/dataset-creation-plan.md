---
title: Dataset Creation Plan
order: 8
status: active
implemented: partial
last_verified: 2026-09-08
---

# Building import and upload for groups

This page is the ordered plan for giving groups their own import and upload paths. It says
what gets built, in what order, and which layer each piece belongs to. The reasoning behind
the shapes chosen here lives in [Dataset creation](./dataset-creation.md); this page does not
repeat it.

The work splits into three features. Feature A is the common ground both halves stand on, and
nothing in it is visible to a user on its own. Feature B is import, and Feature C is upload.
Import is usable end to end when B4 lands, and upload when C5 lands.

Every phase leaves the tree working. No phase edits an existing upload or import service.

## Nothing retires v1

The legacy steppers, pages, routes, and services keep working in parallel throughout. New
modules are added beside them; none is replaced.

Three constraints in this plan can only be finished by the cut-over, and each is recorded in
[v2 cut-over](../v2-cutover.md) under *What only the cut-over may do*: a unique
`origin_path`, retiring the legacy `exists` route, and deleting the two small pieces of logic
that this plan copies rather than shares.

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
[V2 design system](../contributing/v2-design-system.md) and
[V2 page patterns](../contributing/v2-page-patterns.md) govern the rest. The screens are
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

## Feature A — Common work

### A1 — A `contribute` action on the dataset policy

`dataset.create` is `isDatasetOwningGroupAdmin`, so a member of a contributing group can
create nothing. Add `contribute: Policy.or([isDatasetOwningGroupAdmin,
isMemberOfContributingGroup])` to `api/src/authorization/builtin/policies/dataset.js`. The
second policy needs `user.effective_group_ids` and `resource.allow_user_contributions`, and
both are hydrated already. `dataset.create` keeps its meaning, so the existing v2 routes are
unaffected.

*Reuse:* the policy framework, both hydrators. *New:* one policy, one action.

### A2 — Eligible owning groups

`services/datasets_v2/ownership.js` exports `listEligibleOwnerGroups(user)` behind
`GET /v2/datasets/eligible-owner-groups`. A platform admin sees every active group, a group
admin sees the groups they administer, and a member sees groups where
`allow_user_contributions` is true. Each row says which rule admitted it.

*Reuse:* the search helpers in `services/groups.js`, the hydrators. *New:* one service, one
route.

### A3 — Name availability without an oracle

The v2 creation routes answer 409 saying the name is unavailable, never that a dataset holds
it. Add `GET /v2/datasets/name-available`, scoped exactly as the creation routes are. Do not
reuse `GET /datasets/:type/:name/exists`, which answers for any name in the system and is
open to every `user` role.

*Reuse:* `normalize_name`. *New:* one route. *Untouched:* the legacy `exists` route, still
called by the legacy steppers.

### A4 — Per-group dataset names, and the archive layout that makes them safe

One piece of work, because doing half of it loses data. Three changes:

1. `dataset.owner_group_id` becomes `NOT NULL` with a database default pointing at a seeded
   `Unassigned Datasets` group that has no members and accepts no contributions. A legacy
   insert that names no group lands there, so no legacy code changes. Every legacy dataset
   shares one group, so they stay mutually unique on name and type exactly as today. Backfill
   existing nulls in the same migration.
2. `@@unique([name, type, is_deleted])` becomes
   `@@unique([owner_group_id, name, type, is_deleted])`. Exactly one call site reads the old
   compound key, the legacy `exists` route at `api/src/routes/datasets/index.js:1143`.
3. `group` gains an immutable `archive_key`, derived from the slug at creation and never
   updated, because `slug` is regenerated on rename. `get_archive_path`, `get_bundle_name`,
   and the QC directory in `workers/workers/dataset.py` and `tasks/qc.py` gain the group
   directory, as `<archive dir>/<archive_key>/<name>.tar`. Existing archives are unaffected,
   because `dataset.archive_path` is stored per dataset and read rather than recomputed.

4. `dataset` gains `archive_group_key`, stamped from the owning group when the archive is
   written and never recomputed. `archive_path` is already write-once, so this makes the pair
   a complete record of where the bytes went and who owned them at the time.
   Nothing is added to the bundle itself. See *Recovery reads the path* below.

**Order matters.** The paths must carry the group before the constraint is relaxed. Reversed,
two groups register the same name and the second archive overwrites the first.

The database is now PostgreSQL 18, so `NULLS NOT DISTINCT` would run. It is still not used
here, for the reasons in
[Dataset creation](./dataset-creation.md#alternatives-considered).

*Verify:* that `searchDatasetsForUser` still hides `Unassigned Datasets` rows from
non-admins, which it should, because nobody is a member of that group.

*New:* one migration, two columns, three worker path functions. *Untouched:* every v1 route,
and the contents of the bundle.

### A4a — Ownership transfer does not move bytes

Transferring a dataset between groups changes `owner_group_id` and nothing else. It leaves
`archive_path` and `archive_group_key` alone, so the archive keeps recording custody at the
time it was written, which is what a recovery needs to know.

Two rules make that safe.

**Check the name before transferring.** The unique key is
`[owner_group_id, name, type, is_deleted]`, so a transfer into a group that already holds a
live dataset of that name and type fails at the database. The service checks first and
refuses with a plain message.

**Re-archival deletes the recorded object first.** `archive_dataset` recomputes the path from
the current owner, so archiving again after a transfer writes under the new group and
overwrites `archive_path`. Without a delete, the object under the old group is referenced by
nothing and stays on tape forever, because `tasks/delete.py` only ever removes the current
`archive_path`.

*Note:* no ownership transfer route exists yet. This phase is the rules a transfer must obey,
written down before one is built.

### A4b — Recovery reads the path, and nothing is added to the bundle

`<archive dir>/<archive_key>/<name>.tar` already answers the two questions a recovery asks:
which group owned this, and what was it called. Nothing further is written to tape.

**The bundle carries no metadata**, because end users download it. `stage_dataset` extracts
the bundle into the staging directory and `setup_dataset_download` symlinks the tar itself
into the download directory, so any member added to the bundle appears in the file tree a user
browses and in the tar they receive. A field that helps an administrator during a recovery
would be published to everyone who can read the dataset.

**Where metadata may go instead is the tape filename**, which no user ever sees. The tape
object is named by `get_archive_bundle_name` as `{name}.tar`, while `get_bundle_staged_path`
and `get_bundle_download_path` both rebuild it as `{name}.{type}.tar`. Staging renames the
file on the way in. If machine correlation to a database row is ever wanted, the dataset id
belongs there and nowhere else.

**Renames make the path stale, and that is correct.** `PATCH /v2/datasets/:id` accepts a new
name and the upload tombstone renames outright, so the filename on tape stops matching the
current name. Anything written to tape records what was true when it was written. The live
system never reads the path back; it reads `archive_path` and `archive_group_key` from the
database.

The one thing the path cannot carry is the mapping from `archive_key` to the group's current
name. `archive_key` is immutable, so a group renamed from Genomics Core to Center for Genomics
keeps archiving under `genomics-core`. An administrator recovering from a total database loss
reads the older name. That is a legibility cost with no data loss, and it is accepted rather
than solved.

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

Per dataset, a panel on `pages/v2/datasets/[id]/` reads `GET /v2/datasets/:id/upload-log`.
Across datasets, an upload-state filter on the v2 datasets list replaces a parallel uploads
page like the legacy `/datasets/uploads/`.

*Decide when building:* a terminally failed upload is tombstoned, so the dataset is renamed,
marked deleted, and falls out of a normal listing. The filter has to reach those rows, or the
person who uploaded never learns what happened.

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
type. [Dataset creation](./dataset-creation.md#route-1-the-watch-script) describes the
result.

Deployment note: every `/v2` route reads `subject_id` from the caller's JWT, and the workers'
`APP_API_TOKEN` predates that claim. It must be reissued before the workers can call any v2
route.
