---
title: Watched Import Sources
status: idea
implemented: none
last_verified: 2026-09-15
---

::: danger Idea — not committed to
**Nobody has committed to building this.** It proposes making the watch script's
directories, schedule, and health visible to group administrators, and moving its
configuration from the workers' Python config into the database. No `import_source_watch`
table, no scan-reporting route, no watcher status page, and no `reingest` workflow exist
in the codebase.
:::

<!-- cSpell: ignore fnmatch inotify reingest -->

# Watched import sources

## The problem

The watch script is how most datasets enter Bioloop, and the group whose data it registers
cannot see it.

Today a group administrator who wants an instrument's output ingested emails the platform
team. The platform team gets an account on the machine where the instrument writes, mounts
the directory, adds an entry under `registration.ingestion` in the workers' Python config,
and starts `workers.scripts.watch_v2` under pm2. Every fact about the ingestion lives in
that config entry: the directory, the dataset type, the owning group, the reject patterns,
the poll interval, and the workflow to start.
@see [Dataset creation — The watch script](../groups/dataset-creation.md#the-watch-script)

Every fact about whether it is working lives on that host. `pm2 status` says whether the
process is up. `logs/workers/watch.err` says what it last did. Nothing reaches the
database, so nothing reaches the UI.

The group administrator therefore cannot answer any of these without asking a person:

- Which of my directories are watched, and by what rule?
- Is the watcher running right now?
- How often does it look, and when did it last look?
- Did it see the run folder I copied in an hour ago? If not, was it rejected, did
  registration fail, or has it simply not been scanned yet?
- How many datasets did it register this week?

The failure that makes this urgent is silent. `Poller._poll` counts consecutive exceptions
per observer, and at `max_retries` it calls `unregister` and logs one line. The process stays
`online` in pm2 with one directory no longer watched. An unmounted filesystem produces
exactly this. From the group's side, datasets stop appearing and nothing says why. The same
gap is already recorded for import sources, where an unmounted path returns an empty
listing that a user reads as "my data is gone".
@see [Dataset creation — An unreadable source must say so](../groups/dataset-creation.md#an-unreadable-source-must-say-so)

## The observation this design rests on

A watched directory and an import source are the same thing.

`import_source` already models a directory that a group trusts data to arrive in. It carries
`path`, `owner_group_id`, a `status` of `ACTIVE`, `SUSPENDED`, or `RETIRED`, `requested_by`,
`approved_by`, `approved_at`, `path_verified_at`, and `status_reason`. A platform
administrator confirms the path is readable by the API and the workers before inserting
the row, and the row is never deleted because datasets imported from it hold paths
underneath it.
@see [Dataset creation plan — B1](../groups/dataset-creation-plan.md#b1-import-sources-belong-to-a-group-and-have-a-lifecycle)

An entry under `registration.ingestion` carries `source_dir`, `owner_group_id`, and
`rejects`, plus the facts a watcher needs and an import source does not: `dataset_type`,
`workflow`, `poll_interval_seconds`, and `full_scan_every_n_scans`. The first three
duplicate the import source row. The rest describe what to do with new subdirectories,
automatically, instead of waiting for a user to pick one.

So the two dataset routes differ only in who picks the directory. Import is a person choosing
one subdirectory of a source. Watching is a rule choosing every new subdirectory of a source.
The design below names that rule a **watch**, attaches it to an import source, and gives it
the same owner, the same lifecycle, and the same request-and-approve seam the source already
has.

That gives one security property for free, and it is the one that matters. **A group
administrator can never point a watcher at a path.** The path belongs to an approved
`import_source` row, which only a platform administrator creates after checking the mount.
A watch adds behaviour on top of a path someone has already vetted.

## Who controls what

The question that decides the shape of the feature is whether group administrators should
be able to restart the watcher. The answer proposed here is no, and the reason is
structural rather than a matter of trust.

One `watch_v2` process on one host runs every observer configured for that host. A
sequencing core and a neuroimaging lab whose instruments write to the same fileserver share
one process. A restart button for the sequencing core restarts the neuroimaging lab's watch
too, and neither group can see the other. The process is shared infrastructure, and
shared infrastructure stays with the people who run the host.

What a group administrator actually wants when they ask for a restart is one of three
things. The directory they copied in has not appeared. The watcher seems stuck. Or a
setting is wrong. Each has a lever that does not touch the process.

| Lever | Who holds it | What it does |
|---|---|---|
| Pause and resume a watch | group admin | The observer keeps its place in the poller and skips scanning. |
| Rescan now | group admin | The next tick runs a full scan instead of an incremental one. |
| Change the schedule, rejects, workflow, or metadata | group admin | The watcher re-reads its watches on the next tick. |
| Request a watch on a source, or retire one | group admin, approved by platform admin | The same request-and-approve columns `import_source` already has. |
| Re-ingest an edited directory | group admin | Re-archives the same dataset from its source, keeping its id, grants, and history. |
| See status, last scan, recent scans, recent errors | group admin | Read-only, from data the watcher reports. |
| Start, stop, restart, upgrade, move to another host | platform admin | pm2, as today. |
| Assign a watch to a host | platform admin | Mounts differ per host, so only the person who mounted it knows. |
| Re-verify a path | platform admin, on a schedule | Stamps `path_verified_at`, suspends on failure. |

"Rescan now" covers the first complaint. Status covers the second, and turns "it seems
stuck" into a specific message: the watcher on this host last reported at this time, and the
platform team has been notified. The third is a config edit the group makes itself.

The decision is reversible. If a deployment ends up with one process per group, a restart
lever can be added to the same page without changing anything below.

## The model

Three additions, all v2, all additive. The legacy `watch.py` and its `registration.<TYPE>`
config are untouched until cut-over.
@see [v2 cut-over](../v2-cutover.md)

### A watch is a row on an import source

```
import_source_watch
  id
  import_source_id          one watch per source; the path comes from the source
  status                    PENDING | ACTIVE | PAUSED | RETIRED
  status_reason
  dataset_type              RAW_DATA | DATA_PRODUCT
  workflow                  name of the workflow to start, no default
  poll_interval_seconds
  full_scan_every_n_scans
  rejects                   fnmatch patterns, as today
  metadata                  recorded on every dataset, as today
  assigned_host             the worker host that runs this watch, or null
  rescan_requested_at       set by "rescan now", cleared by the watcher
  requested_by_id, approved_by_id, approved_at
  created_at, updated_at
```

`status` is the group's intent. `PENDING` is requested and not yet approved, `ACTIVE` is
meant to be running, `PAUSED` is stopped on purpose by the group, and `RETIRED` is finished.
A source that is `SUSPENDED` or `RETIRED` overrides an `ACTIVE` watch, because a path that
cannot be read cannot be watched.

`assigned_host` is null until a platform administrator sets it. A watch with no host is a
gap to report, not a value to guess. It is never picked up by every host, and never by a
random one.

`workflow` has no default in the row, matching `RegisterV2`, which refuses to construct
without one. The dialog that creates the row offers `integrated` as its initial selection.

### The watcher reads its work from the API, and reports back

`watch_v2.py` stops reading `registration.ingestion`. On start, and again every few ticks,
it calls `GET /v2/import-source-watches?host=<its hostname>` with the workers' service
token, and reconciles: a new `ACTIVE` watch becomes an `Observer`, a `PAUSED` one is
skipped, a changed interval is applied, and a `RETIRED` one is unregistered. `RegisterV2`
is unchanged. It already takes everything as a constructor argument, so the change is only
where the arguments come from.
@see `workers/workers/services/registration_v2.py`

After each scan the watcher posts one summary:

```
POST /v2/import-source-watches/:id/scans
  started_at, finished_at
  scan_type              incremental | full | requested
  directories_seen       subdirectories present
  candidates             after rejects
  created, conflicted, errored    the three lists POST /v2/datasets/bulk returns, as counts
  created_dataset_ids
  error                  message, when the scan itself failed
```

Two records come out of that, and the split is what keeps the table small.

The **heartbeat** is a pair of columns on the watch row, `last_scan_at` and
`last_scan_result`, updated on every scan. A directory polled every ten seconds updates
them 8,640 times a day and writes nothing else.

The **scan history** is a row in `import_source_scan`, written only when a scan created,
conflicted on, or errored on at least one dataset, or failed outright. An idle directory
writes no history. A busy day writes a few rows. Retention is a matter of days, and the
counts that matter longer are answerable from the datasets themselves.

The `Poller` change is one line beyond reporting. When it gives up on an observer at
`max_retries`, it reports that too, so the watch row shows why scanning stopped instead of
merely stopping.

### Status is derived, never stored

The UI shows one word per watch, computed at read time from the intent, the heartbeat, and
the source.

| Shown as | When |
|---|---|
| Watching | `ACTIVE`, source `ACTIVE`, heartbeat within `3 × poll_interval_seconds` |
| Paused | `PAUSED` |
| Stalled | `ACTIVE` and the heartbeat is older than `3 × poll_interval_seconds` |
| Failing | Watching, and the last scan or the last few scans errored |
| Source unavailable | source is `SUSPENDED`; the reason is the source's `status_reason` |
| Not assigned | `ACTIVE` and `assigned_host` is null |
| Pending approval | `PENDING` |

Three intervals is a liveness bound, not a tunable. `Poller` promises at most one call per
interval and sleeps one second between rounds, so two consecutive misses cannot be
scheduling jitter. Stalled means the process is down, the host is down, or the observer was
unregistered. All three are the platform team's to fix, and the message says so.

Nothing here overrides the rule that a defective value is omitted. A watch whose heartbeat
has never been written shows no "last scan" at all, rather than a placeholder.

## What the group sees

**On the group's import sources tab**, each source gains a watch column: the status word,
the last scan time, and the count of datasets registered in the last seven days. A source
with no watch says so and offers "Request a watch".

**On a source's page**, a watch section shows the schedule in words ("every 10 seconds,
full rescan every 60 scans"), the reject patterns, the metadata stamped on each dataset,
the workflow started, the host, and the two buttons: Pause or Resume, and Rescan now. Below
it, the scan history, newest first, each row linking to the datasets it created. Below that,
the last error, verbatim.

**On a dataset's page**, provenance names the source and the scan that registered it, in
place of the bare `create_method: SCAN` it carries today. That needs `import_source_id` on
the dataset, which import already wants for the same reason.

**On a platform administrator's page**, one row per worker host: the last heartbeat from
any watch on it, the watches assigned to it, the ones stalled, and the ones pending
assignment. This is the page that makes "restart it" a question the platform team can answer
from their desk.

**Notifications** ride on the event delivery work. A watch that goes stalled for longer than
some multiple of its interval notifies the platform team and the group's administrators. A
scan that created datasets can feed a daily digest to the group. Both are events the scan
route already sees.
The backlog tracks that work as epic 5, Notifications & Event Delivery, under `.todo/`.

## Re-ingesting an edited directory

The second complaint from group administrators is about data that changed after the watcher
took it. The watcher registers a run folder, the `integrated` workflow archives it, and then
the group fixes something in the folder: a missing lane, a corrected sample sheet, a file the
instrument wrote late. The archive is now wrong and the group wants it taken again.

The source directory is still there. The `integrated` workflow runs `await_stability`,
`inspect`, `archive`, `stage`, `validate`, and `setup_download`, and none of those touches
the origin. So "edit the directory" means editing the same path the dataset was registered
from, and re-ingesting means archiving that path again.

### What happens today

The only route is to delete the dataset and wait. Deleting an archived dataset starts the
`delete` workflow, which removes the archive from storage, marks the row `is_deleted`, and
renames it to `<name>-<id>` so the name is free under the unique key. The watcher compares
directory names, not contents, so the edited directory is invisible to it until a full scan,
which in production is every ninetieth scan, or fifteen minutes. The full scan sees a name
with no live dataset, registers it, and starts the workflow.

It works, and every step of it is invisible to the person waiting.

- Nothing says whether the `delete` workflow has finished. Until it has, the name is taken
  and the rescan finds a conflict.
- Nothing says when the next full scan is.
- Nothing says whether the full scan picked the directory up, or rejected it, or failed.
- Nothing says that the workflow on the new dataset is running.

And the result is a different dataset. The new row has a new id and a new `resource` row.
Every grant on the old dataset, every collection it was in, every access request against it,
and its whole audit and state history belong to a row that is now deleted. The group redoes
the sharing by hand, and anyone holding a link to the old dataset gets nothing.

### Re-ingest keeps the dataset

The design adds one action on a dataset, **Re-ingest from source**, and one workflow behind
it. The dataset keeps its id, its `resource` row, its grants, its collection memberships, and
its history. Only the bytes in the archive change.

The `reingest` workflow is the tail of `integrated` with one step in front:

1. **Supersede the archive.** Record the current `archive_path`, size, and checksum as the
   archive being replaced, in a state entry rather than a new table, and clear the staged
   copy so nobody downloads the old bytes under the new description.
2. `await_stability`, `inspect`, `archive`, `stage`, `validate`, `setup_download`, exactly
   as `integrated` runs them.
3. **Remove the superseded archive** only after the new one has validated. A failed
   re-ingest leaves the old archive in place and the dataset says so.

The action refuses, with the reason, when the origin path no longer exists, when the
source is not `ACTIVE`, or when another workflow is running on the dataset. A group
administrator of the owning group may run it, on the same footing as delete.

The dataset page shows the re-ingest as a state and an audit row: who asked, when, what the
archive was before, and what it is now. That is the whole answer to "did it take my fix".

### The watcher can notice the edit

The watcher cannot see an edit today because `Observer.watch` compares sets of names. A
full scan could also record each directory's modification time and compare it with the time
recorded at registration. A directory whose mtime is newer than its archive is shown on the
dataset page as **source changed since archive**, with the Re-ingest button beside it.

This is a hint for display, not a fact about the bytes. A directory's mtime changes when an
entry is added or removed at its top level, and not when a file three levels down is
rewritten. The hint is cheap, catches the common case of a lane or a file added at the top,
and never blocks anything. Precision belongs to the `inspect` step, which walks every file.

### Delete-and-rescan still works, and becomes visible

Some groups will keep deleting, and the rest of this design makes that path legible without
any further work. The delete confirmation names the `delete` workflow it starts, the dataset
page shows that workflow running, the source page shows when the next full scan is due, and
**Rescan now** replaces the fifteen-minute wait. The scan history then shows the directory
being registered again.

### What this does not decide

Re-ingest replaces the archive. It does not keep the old one. A dataset that needs both
versions readable, with grants attached to one or the other, is the versioned datasets
question, which is marked as a foundation decision because it changes what a grant attaches
to. Re-ingest is shaped so that versioning can be added underneath it: step 1 already
records what the superseded archive was, and step 3 is the only place that discards it.
@see [Group use cases — item 51](../groups/use-cases.md#_4-2-evolution-over-time)

## Requirements to anticipate

None of these is built here. Each is named so the model above does not foreclose it.

**Several worker hosts with different mounts.** `assigned_host` is a string today. If hosts
are grouped into pools, it becomes a foreign key to a host table that also holds the last
heartbeat, and nothing in the watch changes.

**"Ready" rules per source.** Today a subdirectory is a dataset the moment it appears, and
the `await_stability` workflow step waits for it to stop changing. Sequencers write a
completion marker, `CopyComplete.txt` on Illumina instruments, for example, and a source
should be able to say "register when this file exists" or "register when nothing has changed
for this long". That is a column of accept rules beside `rejects`, evaluated in the same
place, and the scan summary gains a `waiting` count.

**Naming rules per source.** A prefix to strip, a run id to extract. A small transform
recorded on the watch and applied by `RegisterV2` before it builds the payload.

**Placement into collections.** Everything from this instrument goes into this collection.
That is the [collection placement rules](./collection-placement-rules.md) idea, keyed on
the source the dataset came from, which is why the dataset needs `import_source_id`.

**Consent codes and restrictions per source.** A source that only ever produces restricted
data records that on the watch, and `RegisterV2` sends it with every dataset, the way it
already sends metadata.

**Manifest-driven ingestion.** The multimodal ingest work wants a run folder with a
sidecar manifest that names several datasets, not one. The scan summary's shape holds, and
the watch gains a `layout` telling the observer whether a subdirectory is one dataset or a
bundle.
The backlog tracks that work as epic 9, Multimodal ingest schema, under `.todo/`.

**Event-driven instead of polled.** An instrument, or a copy job, calls
`POST /v2/import-source-watches/:id/notify` when a run finishes, and the watcher scans on
the next tick instead of waiting for the interval. This is the "rescan now" flag with a
different caller, which is why `rescan_requested_at` is a column rather than a UI-only
action. inotify on the host is the same thing from the other direction.

**A runaway directory.** A misconfigured copy job that creates a thousand subdirectories
overnight registers a thousand datasets and starts a thousand workflows. A per-watch
ceiling on datasets per scan, with the excess reported as `waiting` and the group notified,
is one column and one check in `RegisterV2`.

**Audit.** A group administrator changing a poll interval or pausing a watch is an action on
the group's data flow and belongs in the same audit trail as a grant. Every write to
`import_source_watch` through the API records who and when.

**Dry run from the UI.** `watch_v2 --dry-run` already logs what would be registered without
registering. Exposed as "Preview next scan" on the source page, it answers "will it pick up
my folder" before the folder is copied.

## What it would take

Four steps, each useful on its own and each small enough to reverse.

1. **Visibility only.** Each `registration.ingestion` entry gains an `import_source_id`.
   The watcher posts scan summaries against it. The group's import sources tab shows the
   status word and last scan. Configuration stays in the Python config. This is the step
   that ends "is it running?" emails, and it is one route, two columns, and one UI column.
2. **Pause, resume, and rescan now.** Three columns and a read on each tick.
3. **Configuration moves to the database.** The `import_source_watch` table, the list
   route, the reconcile loop in `watch_v2.py`, and the request-and-approve dialog. The
   `registration.ingestion` block is retired at cut-over, with the legacy `watch.py`.
4. **Hosts and notifications.** The platform administrator's host page, and the stalled and
   digest events.
5. **Re-ingest.** The `reingest` workflow, the dataset action, and the mtime hint on full
   scans. Independent of steps 3 and 4, and worth doing early because it removes a whole
   category of hand-holding on its own.

The workers ship separately from the API, so step 1 and step 3 each pair a workers release
with an API release, as the v2 bulk route did.
