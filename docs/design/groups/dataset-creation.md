---
title: Dataset Creation
order: 7
status: active
implemented: partial
last_verified: 2026-09-08
---

# The three ways a dataset gets created

A dataset enters Bioloop by one of three routes. A watch script finds a directory on a
watched filesystem. A user picks a directory the instrument already wrote, and imports it.
A user uploads files from their browser. The three routes differ only in how the bytes
arrive and who asks. They converge on the same two functions, so ownership, audit, and
state are decided in one place.

This page explains each route in plain terms and says what each one still needs before
every dataset carries an owning group. The detailed request-by-request account of the
upload transfer lives in [Dataset Upload](../../reference/features/dataset-upload.md),
and import source configuration lives in
[Dataset Import](../../reference/features/import_sources.md).

## Two shared cores, one per half

There are **two** pairs of creation functions, one in each half of the codebase, and they
have the same names. Which pair a route uses decides what it gets.

`api/src/services/dataset.js` holds the legacy pair. `buildDatasetCreateQuery` turns a
request body into a Prisma create query: it normalizes the name, sets the initial state to
`REGISTERED`, and writes an `action: 'create'` audit-log row naming the user. For an import
it also writes a `dataset_import_log` row. `create` runs that query, treating a live dataset
with the same name and type as a conflict rather than a duplicate.

`api/src/services/datasets_v2/create.js` holds the v2 pair. Its `buildDatasetCreateQuery`
does the same normalizing, and adds three things the legacy one does not: it refuses without
an `owner_group_id`, it creates the `resource` row the grant model needs, and it records any
consent codes the request carried. Its `createDataset` runs that query inside a transaction
and calls `grantService.seedOwningGroupGrant`, so the owning group holds a grant on its new
dataset before the transaction commits.

**A change to ownership at creation belongs in the v2 pair.** The legacy pair is frozen —
it takes bug fixes, not features. See [v2 cut-over](../v2-cutover.md) for the rule and for
what has to be true before the legacy routes can be switched off.

## Route 1: the watch script

A poller on a worker host watches two directories, one for `RAW_DATA` and one for
`DATA_PRODUCT`. The script is `workers/workers/scripts/watch.py`. It lists new
subdirectories, drops names matching the reject patterns, and batches the rest into groups
of a hundred.

For each batch it calls `POST /datasets/bulk` with a name, a type, the resolved absolute
path as `origin_path`, and `create_method: 'SCAN'`. The endpoint returns three lists:
`created`, `conflicted`, and `errored`. Conflicts are expected and ignored, because the
same directory is seen on every scan.

For each dataset that was actually created, the script starts the `integrated` workflow
through Celery and registers the workflow id against the dataset. No human is involved at
any point, so there is nobody to ask which group should own the result.

## Route 2: import

Import registers data that is already on a filesystem the API can read. Nothing is copied.
The dataset's `origin_path` points at the existing directory.

An administrator first registers the browsable locations as rows in the `import_source`
table. Only paths under a registered source can be browsed or imported, and the API
enforces that on the server as well as hiding it in the UI.

The user works through a three-step stepper at `/datasets/imports/new`. Step one picks an
import source and then a directory under it, using a typeahead backed by `GET /fs`. Step
two collects the name, the type, and optional links to a project, an instrument, or a
source dataset. Step three submits.

Submitting does two things. It calls `POST /datasets` with `create_method: 'IMPORT'`,
which re-checks that `origin_path` falls inside a registered import source and then
creates the dataset. It then calls the workflow route to start the `integrated` workflow,
the same workflow the watch script starts.

## Route 3: upload

Upload is the only route that moves bytes. The user selects files or a directory in the
browser, and the browser sends them to the API.

The stepper at `/datasets/uploads/new` mirrors the import stepper: select files, fill in
general info, then upload. Submitting runs a three-call sequence.

First the UI calls `POST /datasets/uploads`. This creates the dataset with
`create_method: 'UPLOAD'`, computes a deterministic `origin_path` of the form
`<upload dir>/<raw_data|data_products>/<dataset id>/<name>`, and creates a
`dataset_upload_log` row with status `UPLOADING`. The path is fixed before any byte
arrives, so nothing later depends on the transfer having succeeded.

Then the browser transfers each file to the TUS server the API hosts at
`/api/uploads/files`. TUS is a resumable-upload protocol, so an interrupted transfer
resumes rather than restarting. As each file finishes, the API's `onUploadFinish` hook
moves it out of TUS staging and into `origin_path`, preserving relative paths for a
directory upload.

Finally the UI calls `POST /datasets/uploads/:id/complete`, which sets the log to
`UPLOADED` and stores the client's manifest hash. This call moves no files. Every file is
already in place by the time it runs.

From `UPLOADED` onward a worker cron takes over. `manage_upload_workflows.py` runs each
minute, spawns a Celery task to verify the BLAKE3 checksums, and on success starts the
`integrated` workflow. The log walks `VERIFYING`, `VERIFIED`, `PROCESSING`, and
`COMPLETE`, with a failure branch that retries three times before giving up.

## Route 4: the v2 endpoint

`POST /v2/datasets` is the first creation route on the v2 pair. It requires
`owner_group_id`, authorizes with the `dataset.create` policy, accepts consent codes in the
body, and seeds the owning group's grant. It covers the single-dataset case only. Upload,
import, and bulk registration have no v2 route yet, so the workers and both steppers still
call the legacy endpoints.

## Everything after creation is shared

The three routes differ only at the moment a dataset row is written. Every step after that
keys on `dataset_upload_log.dataset_id` and `dataset.origin_path`. No step asks which
service created the dataset.

The TUS server looks up the upload log by dataset id and moves each file to
`dataset.origin_path`. The completion route, the upload-log patch, and the status and log
reads all address the log by dataset id. On the worker side, `manage_upload_workflows.py`
polls `dataset_upload_log` by status, the `verify_upload_integrity` task hashes what is at
`origin_path`, and the `integrated` workflow runs the same five steps for every dataset.

Import browsing is shared for a different reason. `GET /fs` and `GET /datasets/imports/sources`
enforce the `import_source` allowlist, which is a fact about the filesystem rather than
about groups.

**This is why moving upload and import onto v2 is a small change.** The only thing that has
to be rewritten is the call that decides ownership. The transfer, the verification, and the
workflows carry over untouched.

## What groups break that was safe when everything was global

Creation was written when every authenticated user could see everything. Groups make that
assumption wrong in six places. Each is stated with the failure it allows and the fix this
design takes.

### Import sources are visible to everyone

`GET /datasets/imports/sources` returns every row of `import_source` with no filter, and
`GET /fs` resolves a requested path against every row as well. The `fs` and `import_sources`
permissions are granted to the `user`, `operator`, and `admin` roles alike. Any authenticated
user can therefore list every configured drop directory and read the names of everything
inside it.

`import_source` has an `owner_id` column pointing at a `user`, and no route reads it.

**The fix.** `import_source` gains `owner_group_id`. New v2 routes serve only the sources
owned by a group the caller belongs to, has oversight of, or administers, with a platform
admin seeing all. The `owner_group_id` is nullable, so a source with no group stays reachable
through the legacy routes and invisible to the v2 ones.

**Scoping the list is not enough on its own.** The v2 filesystem route must resolve a
requested path against the caller's own sources rather than against all of them. Hiding a
source from a list while still serving its contents to a guessed path is decoration.

Sharing a source between groups is deferred. `import_source` could become a `resource` and be
granted like a dataset, and that is the consistent answer, but no requirement asks for it yet.

### Importing registers a directory somebody else already owns

`dataset.origin_path` is not unique, and no code checks it. Import registers a path that
already exists on disk, so one group can import a directory another group already imported.
Both groups then own a dataset over the same bytes, and each set of grants exposes the
other's files.

**The fix.** The v2 import service refuses when a live dataset already holds that
`origin_path`. The refusal says the directory is already registered and names neither the
dataset nor its group.

A database constraint would be stronger, and it is not safe to add yet: the legacy routes
write the same column, and nothing has audited whether duplicates already exist. Audit first,
constrain afterwards.

### Dataset names are unique across the whole system

`dataset` carries `@@unique([name, type, is_deleted])`. Two things follow.

A member of one group can discover another group's dataset names.
`GET /datasets/:type/:name/exists` answers yes or no for any name, and every `user` role may
call it. The v2 create route's 409 says a dataset with that name already exists, which
confirms the same fact.

A group can also deny a name to every other group forever, by taking it first.

**The fix, in two parts.** The v2 creation routes must not confirm a dataset the caller
cannot see. They answer 409 saying the name is unavailable, without asserting that a dataset
holds it. A v2 name-availability endpoint scoped the same way as the creation routes gives
the interface something safe to call, and the legacy `exists` route is not reused.

Making the name unique per owning group is the real fix and it is blocked, for the reason
below.

### Worker paths are keyed by dataset name

`get_archive_path` builds `<archive dir>/<name>.tar`, `get_bundle_name` builds
`<name>.<type>.tar`, and the QC task builds `<qc dir>/<name>/qc`. None includes the dataset
id. Staging is the exception: `compute_staging_path` salts its alias with the id already.

Today the global name constraint hides this. Relax the name to per-group uniqueness and two
same-named datasets in different groups write the same archive bundle, so one silently
overwrites the other. That is data loss rather than a disclosure.

**The fix.** Key those three paths by dataset id before relaxing the name. The change is
cheap and safe, because `dataset.archive_path` is stored per dataset: an existing dataset
reads its recorded path, and only newly archived datasets use the new formula.

### The creation dialogs would expose projects and instruments

`instrument.name` is globally unique and `project.owner_id` points at a user. The legacy
steppers let a user attach either to a new dataset, which under groups means one group
browsing another's projects.

**The fix.** The v2 creation dialogs do not offer project or instrument assignment. Dropping
the field removes the leak outright, and neither concept has been reconciled with groups yet.
Attachment after creation stays available through the existing routes.

### What is already safe, and should stay that way

The upload directory is keyed by dataset id: `<upload dir>/<type>/<id>/<name>`. Two groups
uploading the same name never collide, and no scoping work is needed.

`POST /v2/datasets/bulk` returns a `conflicted` list of names and types. Those are the
caller's own inputs echoed back, so the response tells the caller nothing they did not send.
It does confirm that the name is taken somewhere, which is the same oracle as above, and it
is acceptable here because the only caller is the service account.

## What still has to change

None of the three routes records an owning group. They all succeed anyway, because
`dataset.owner_group_id` is nullable. Migration `20260908010000_dataset_owner_group_required`
made the column `NOT NULL`, and `20260909010000_dataset_owner_group_nullable` put it back,
because a constraint only v2 needs cannot sit on a column the legacy routes write. The
requirement moved up a layer instead. `buildDatasetCreateQuery` in
`api/src/services/datasets_v2/create.js` throws without an owning group, and
`POST /v2/datasets` validates it.
@see docs/design/v2-cutover.md — What v2 requires that the schema does not

So the gap is not a missing field on the legacy routes. It is that all three creation paths
still run through the legacy service, which has no concept of an owning group. Verified on
2026-09-08: the watch script registered a dataset through `POST /datasets/bulk` and the whole
`integrated` workflow ran to completion, with `owner_group_id` left null.

### Two new creation routes

Upload and import each need one new route and one new service, and neither touches the
existing upload or import code. `POST /v2/datasets/uploads` creates the dataset through the
v2 pair, computes the same deterministic `origin_path`, and creates the `dataset_upload_log`
row in one transaction. `POST /v2/datasets/imports` re-checks `origin_path` against the
registered import sources, then creates through the v2 pair and starts the `integrated`
workflow.

Upload needs one more read route. The v1 upload-log reads are gated by the RBAC
`accessControl('datasets')` middleware, and a contributor is not an administrator, so
`GET /v2/datasets/:id/upload-log` authorizes the same data through the policy engine.

Two small pieces are copied rather than shared. The `origin_path` format and the
import-source prefix check both sit inline in legacy route bodies rather than in services.
The format is fixed by data already on disk, so the copies cannot drift in a way that
matters. Cut-over deletes the legacy copy.

**The workers need no new code.** Import starts a workflow through a v2 route that already
exists, and upload post-processing is driven by the upload log rather than by the creation
path.

### Contribution needs a policy, not a comment

The design says an ordinary member of a group with `allow_user_contributions` may upload into
that group. The `dataset.create` policy is `isDatasetOwningGroupAdmin`, so a member cannot.
The policy file records the intent that contribution is enforced at the service layer, and no
service enforces it.

A new `contribute` action resolves this. It reads
`Policy.or([isDatasetOwningGroupAdmin, isMemberOfContributingGroup])`, and the two v2
creation routes authorize against it. The rule then lives in the policy engine, where every
other access decision already lives. `dataset.create` keeps its current meaning, so
`POST /v2/datasets` and `POST /v2/datasets/bulk` are unaffected.

### Choosing the group

`GET /v2/datasets/eligible-owner-groups` answers one question for the creation dialog: which
groups may this user own a new dataset in? A platform admin sees every active group, a group
admin sees the groups they administer, and a member sees groups where
`allow_user_contributions` is true. Each entry says which of the three rules admitted it. The
rules themselves are set out in
[Design — Dataset Creation and Initial Ownership Assignment](./design.md).

One eligible group auto-assigns and the dialog says which. Several require an explicit
choice. None blocks submission with a plain message. The endpoint is the single
implementation of the three rules, so the interface and the policy cannot disagree.

### Where a user starts

Creation begins on the datasets tab of a group or a collection, from the button those tabs
already carry. The group whose page the user is on is the natural owning group, so it is
preselected, and a user with one eligible group never sees a group picker at all. Creating
from a collection also adds the new dataset to that collection.

The two tabs need different treatment. A group's datasets tab has one action, so its button
opens a chooser offering import or upload. A collection's tab has two unrelated actions:
adding a dataset that already exists, and creating one. Today a single button labelled "New
Dataset" opens the add-existing dialog, which is the wrong action under that label.

### What the creation dialogs look like

The screens are drawn in
[`docs/public/mockups/dataset-creation-screens.html`](/mockups/dataset-creation-screens.html):
the chooser, both dialogs, the transfer in flight, the panel that replaces the upload page,
and the refusals each dialog can show.

Both are modals rather than full-page steppers, following the pattern the rest of the v2
screens use: the component owns its own network calls, loading, and errors, exposes only
`show` and `hide`, and emits one event when it succeeds. `CollectionCreateModal` is the
closest existing example, down to the owning-group picker.

The chooser distinguishes the two by where the data already is, rather than by mechanism,
and states how long each takes. That is the difference a user feels. It also names the owning
group in its subtitle rather than asking for it, because the user reached it from that
group's own page.

**Import** asks for a source, a directory under it, a name, a type, and an owning group. The
directory field is a typeahead over the filesystem route, which only ever serves paths inside
a registered import source the caller's groups own. Nothing is copied, so the dialog closes
as soon as the dataset exists.

**Upload** asks for files or a directory, a name, a type, and an owning group. It then does
three things in order: registers the dataset, hashes the files in the browser, and transfers
them. Progress belongs on the dataset's own page afterwards rather than in the dialog,
because verification and the workflow take minutes and nobody should hold a modal open.

The v2 dataset page shows nothing about upload state today, so it gains a surface for it.

### What carries over from the existing screens

The existing import and upload screens are full-page steppers written against the v1
services, and they are replaced rather than adapted. What survives is logic rather than
markup: the resumable-transfer loop, the browser-side checksum service, the directory
typeahead's behaviour, and the vocabulary of upload statuses. The checksum service in
particular already abstains cleanly when hashing fails, which is the behaviour the
verification step expects.

### The watch script

The watch script has no user to ask, so the group comes from the source. Ownership is a
property of the watched location rather than of the run.

**Configuration is keyed by ingestion directory, not by dataset type.** Each entry under
`registration.ingestion` names one watched directory, and the dataset type is a property of
that entry alongside the owning group. Several directories may therefore feed the same type
under different groups, which one key per type could not express. `build_observer` takes an
ingestion key and reads everything it needs from that entry. A missing `source_dir`,
`dataset_type`, or `owner_group_id` raises at start-up, because a gap in a configuration
table is a thing to report rather than a value to guess.

Any key an entry carries beyond the recognised ones becomes the dataset's metadata. A new
ingestion directory that needs to record its instrument or intake programme is a config
change rather than a code change.

`RegisterV2` lives in `workers/workers/services/registration_v2.py` and takes everything as
a constructor argument, so it never reads configuration itself. It sends each dataset to
`POST /v2/datasets/bulk` with its own `owner_group_id`, in the same shape the single-create
route accepts. The route authorizes once per distinct group in the batch rather than once
per dataset.

Batches are capped at `MAX_DATASETS_PER_BULK_REQUEST`, which mirrors the route's own
`isArray({ min: 1, max: 100 })`. A first scan of an established directory can find thousands
of subdirectories, and an oversized request is rejected whole.

`--dry-run` logs the request each directory would send and sends nothing.

Run `watch_v2.py` or `watch.py`, never both. They poll the same directories and would race to
register the same new subdirectory.

The workers ship separately from the API, so the release that requires the field and the
release that sends it have to be coordinated. The workers' service token is part of that:
every `/v2` route reads `subject_id` from the caller's JWT, and a token minted before the
groups work does not carry the claim.

### A smaller gap

The Owner column on `/v2/datasets` is empty for every row. `GET /v2/datasets` never sets the
`includes.owner_group` flag its service already supports, although the by-ID route does.
