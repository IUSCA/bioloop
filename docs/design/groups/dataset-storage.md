---
title: Dataset Storage
order: 9
status: active
implemented: partial
last_verified: 2026-09-08
---

# Archival, staging, and download

A dataset's bytes live in four places over its life. This page says what each place is
called, who writes it, what the path is named, and why. It covers the target state, in which
every dataset has an owning group.

The naming rules are the whole point of the page. Get them wrong and two groups overwrite
each other's archives.

## The four locations

| Location | What it holds | Path |
|---|---|---|
| Origin | The dataset as it arrived | `dataset.origin_path` |
| Archive | One tar bundle on SDA, the tape system | `<archive>/<archive_key>/<name>.tar` |
| Staged | The bundle fetched back and extracted | `<stage>/<stage_alias>/<name>` |
| Download | Symlinks the download server may read | `<download>/<stage_alias>` and `<download>/bundles/<stage_alias>/<name>.tar` |

Two working directories are transient. `bundle.generate` holds the tar while it is being
built, and `bundle.stage` holds the copy fetched back from tape before extraction. Both are
per dataset type and neither is ever read by a person.

## Two naming rules, and where each applies

**Tape paths are readable, because a person reads them without the database.** The case that
justifies the whole scheme is a catastrophic loss of the database. An administrator then has
tape and nothing else, and must be able to tell what a bundle is. So the archive path names
the owning group and the dataset, and nothing else on tape needs to be legible.

**Download paths are opaque, because a URL is handed to a browser.** Every path under the
download root reaches an end user. A guessable path is an enumeration surface, so the
directory component is `stage_alias`, a salted hash of the dataset's id and name. The last
segment stays readable, because a browser names a saved file from it.

**Working paths are keyed by id, because nobody reads them.** The tar under construction is
named for the dataset's integer id. It is deleted as soon as it reaches tape.

A name alone is never enough for uniqueness anywhere, because two groups may hold a dataset
of the same name and type.

## Archival

`archive_dataset` builds a tar of `origin_path` in the generate directory, named for the
dataset id. It uploads that file to `<archive>/<archive_key>/<name>.tar`, records the result
in `dataset.archive_path` and `dataset.archive_group_key`, and deletes the local copy.

**`archive_path` is written once and read forever after.** Nothing recomputes it. Staging and
deletion both read the column, so a later rename or ownership transfer cannot orphan the
bytes.

**`archive_group_key` records who owned the dataset when the bundle was written.** The
current owner can change; the tape object does not move. The column is the honest record of
what the path means.

**The group key is not the slug.** `group.slug` is regenerated whenever a group is renamed,
so an archive layout built on it would fragment the first time somebody renames a group.
`group.archive_key` is derived from the slug at creation and never updated.

**Nothing is added to the bundle.** End users download it, so any metadata inside it is
published to everyone who can read the dataset. See
[Dataset creation](./dataset-creation.md#alternatives-considered) for the manifest that was
considered and rejected.

## Staging

`stage_dataset` fetches the object named by `archive_path` into the bundle staging directory,
verifies its checksum against `dataset.bundle.md5`, and extracts it to
`<stage>/<stage_alias>/<name>`.

`stage_alias` is a salted hash of the dataset's id and name, computed once and stored in
`dataset.metadata.stage_alias`. Every later read takes the stored value, so a rename does not
move a staged dataset. The salt is `config['stage']['alias_salt']`.

Both the fetched bundle and the extracted tree are keyed by the alias, so two groups staging
datasets of the same name and type do not collide.

## Download

`setup_download` creates two symlinks under the download root and grants the traversal
permissions the download server needs.

- `<download>/<stage_alias>` points at the extracted tree. Individual file downloads resolve
  through it as `<stage_alias>/<relative path>`.
- `<download>/bundles/<stage_alias>/<name>.tar` points at the fetched bundle. The alias
  directory supplies uniqueness and the filename stays readable.

**Serving is token-scoped.** The API mints a download token whose scope is the exact path,
then returns that path and the token to the browser. `secure_download` compares the requested
path against the token's scope and refuses anything else. In production it answers with an
`X-Accel-Redirect` into an `internal` nginx location; in development it streams the file
through Express.

**The browser names the saved file from the last path segment.** nginx adds
`Content-Disposition: attachment` with no filename, so the last segment is the filename the
user gets. That is why the bundle symlink keeps a readable last segment rather than being
named for the alias.

## Deletion

`delete_dataset` removes the object at `archive_path` and clears the column. It deletes
nothing else on tape, so any object no longer referenced by a live `archive_path` stays
forever.

**Re-archival after an ownership transfer must delete the old object first.** Archiving
recomputes the path from the current owner, so a transferred dataset archived again writes
under the new group and overwrites the column. Without an explicit delete, the object under
the old group is referenced by nothing.

## Quality-control reports

`create_qc_report` writes to `<qc>/<archive_key>/<name>/qc`. The directory carries the group
for the same reason the archive does: it is keyed by name, and names are only unique within a
group.

## What group scoping changed

`dataset.owner_group_id` is `NOT NULL` with a database default naming a seeded
`Unassigned Datasets` group. That group has no members and accepts no contributions. An
insert that names no group lands there, so every row has an owner without any caller being
required to supply one.

The unique key is `[owner_group_id, name, type, is_deleted]`. Two groups may hold a dataset
of the same name, and neither can discover that the other does. Rows that landed in
`Unassigned Datasets` share one group, so they stay mutually unique on name and type exactly
as they were under the old key.

**Paths had to change before the constraint did.** Reversed, two groups register the same
name and the second archive silently overwrites the first. That is data loss rather than a
disclosure, which is why the two are one piece of work.

**This change edits legacy code, unlike the rest of the groups work.** Storage layout and the
naming constraint are single facts about the system, and there is no way to give the legacy
half one archive layout and the new half another. The seeded default is what makes the edit
safe: legacy callers pass no group, land in one group, and behave exactly as before.
See [v2 cut-over](../v2-cutover.md).
