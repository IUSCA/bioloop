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

Upload and import each need one new route and one new service. Neither touches the existing
upload or import code. `POST /v2/datasets/uploads` creates the dataset through the v2 pair,
computes the same deterministic `origin_path`, and creates the `dataset_upload_log` row in
one transaction. `POST /v2/datasets/imports` re-checks `origin_path` against the registered
import sources, then creates through the v2 pair and starts the `integrated` workflow.

Two small pieces are copied rather than shared. The `origin_path` format and the
import-source prefix check both sit inline in legacy route bodies rather than in services.
The format is fixed by data already on disk, so the copies cannot drift in a way that
matters. Cut-over deletes the legacy copy.

### Contribution needs a policy, not a comment

The design says an ordinary member of a group with `allow_user_contributions` may upload into
that group. The `dataset.create` policy is `isDatasetOwningGroupAdmin`, so a member cannot.
The policy file records the intent that contribution is enforced at the service layer, and no
service enforces it.

A new `contribute` action resolves this. It reads
`Policy.or([isDatasetOwningGroupAdmin, isMemberOfContributingGroup])`, and the two v2
creation routes authorize against it. The rule then lives in the policy engine, where every
other access decision already lives. `dataset.create` keeps its current meaning, so
`POST /v2/datasets` is unaffected.

### Choosing the group

`GET /v2/datasets/eligible-owner-groups` answers one question for the stepper: which groups
may this user own a new dataset in? A platform admin sees every active group, a group admin
sees the groups they administer, and a member sees groups where `allow_user_contributions`
is true. Each entry says which of the three rules admitted it. The rules themselves are set
out in [Design — Dataset Creation and Initial Ownership Assignment](./design.md).

One eligible group auto-assigns and the stepper says which. Several require an explicit
choice. None blocks submission with a plain message. The endpoint is the single
implementation of the three rules, so the UI and the policy cannot disagree.

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
