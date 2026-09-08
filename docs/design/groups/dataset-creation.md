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
`owner_group_id`, authorizes with the `dataset.create` policy so only an admin of the
owning group may use it, accepts consent codes in the body, and seeds the owning group's
grant. It covers the single-dataset case only. Bulk registration and upload have no v2
route yet, so the workers and the upload stepper still call the legacy endpoints.

## What still has to change

Migration `20260908010000_dataset_owner_group_required` made `dataset.owner_group_id`
`NOT NULL`, which broke all three legacy routes at once — none of them sends an owning
group. Migration `20260909010000_dataset_owner_group_nullable` reversed it. The requirement
now sits in the v2 service and route rather than on the column, so the legacy routes work
and v2 creation still refuses without an owning group.

A dataset created through a legacy route therefore has no owning group and no seeded grant.
It is outside the ownership path until somebody assigns one, which is what the archived
`Unassigned Datasets` group is for. Creation refuses rather than falling back to that group;
it holds the rows the migration moved, not a resting place for new ones.

Each remaining route needs a different answer to the same question.

**Upload and import** ask the user. The ownership rules are in
[Design — Dataset Creation and Initial Ownership Assignment](./design.md). A platform
admin picks any group, a group admin picks from the groups they administer, and an
ordinary user picks from groups where they are a member and `allow_user_contributions` is
true. One eligible group auto-assigns, several require a choice, and none rejects the
request. None of that is implemented; `allow_user_contributions` can be set and read, and
nothing enforces it.

**The watch script** has no user to ask, so the group has to come from the source. The
configured directory is the only signal it has, which makes ownership a property of the
watched location rather than of the run.

Bulk registration and upload each need a v2 route that returns 400 naming
`owner_group_id` when it is absent. The workers ship separately from the API, so the release
that requires the field and the release that sends it have to be coordinated.

Two smaller gaps sit alongside this work. The Owner column on `/v2/datasets` is empty for
every row, because `GET /v2/datasets` never sets the `includes.owner_group` flag its
service already supports. Neither import nor upload has a `/v2` entry point yet; both
still live under the `/datasets` routes.
