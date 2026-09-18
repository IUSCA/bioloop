---
title: Seeding a production database
order: 6
---

# Seeding a production database

A new Bioloop deployment needs a small set of rows before anybody can sign in. `npm run
seed:prod` writes them. It is idempotent, so it is safe to run on every deploy, and it
writes no dummy data of any kind.

The dummy datasets, groups, and traffic that a development database has come from `npx
prisma db seed`, which calls the same code first and then adds its own rows on top. The
two never drift, because there is one definition of the baseline.

## What the baseline contains

| Rows | Source |
| --- | --- |
| The three roles: `admin`, `operator`, `user` | `ROLES` in `api/src/constants.js` |
| The `svc_tasks` service account, at its pinned ids | `ensureSvcTasksAccount()` |
| Grant access types | `GRANT_ACCESS_TYPES` in `api/src/constants.js` |
| The partial order over access types | `GRANT_ACCESS_TYPE_IMPLICATIONS` |
| Grant presets and their members | `GRANT_PRESETS` |
| Users | `admins.json`, `operators.json`, `users.json` |
| Import sources | `import_sources.json` |

A preset removed from `GRANT_PRESETS` stays in the table with `is_active` set to false. Grants
and access request items still reference it, so the seed retires it rather than deleting it.
A preset the constant lists is set active on every run.

Two further sets of rows are created by migrations rather than by the seed, because the
constraints that reference them are added in the same migration: the `Authenticated Users`
and `Public` principals, and the `Unassigned Datasets` group. The seed checks both are present
and refuses if they are not.

A migration once created restriction types as a third set, and the seed checked for them. Both
are gone: what an archived group or a deleted dataset forbids is decided by each resource type's
own state rules in `api/src/state/builtin/`, from the archived and deleted columns, with no
lookup table to seed.

## Running it

Migrate first, then seed. From the `api/` directory:

```bash
npx prisma migrate deploy
npm run seed:prod
```

Under Docker, run both inside the API container:

```bash
docker compose -f docker-compose-prod.yml exec api npx prisma migrate deploy
docker compose -f docker-compose-prod.yml exec api npm run seed:prod
```

Check the JSON files without writing anything first:

```bash
npm run seed:prod -- --dry-run
```

The dry run parses and validates every file, confirms the migrations have run, and reports
how many users and import sources would be created. It writes nothing.

## The service account

`svc_tasks` is the account every unattended write is credited to: the workers, the watch
script, and any row the system issues rather than a person. The workers authenticate as it
with a never-expiring `APP_API_TOKEN` that carries its `id` and `subject_id` as claims, and
nothing reissues that token automatically.

So the ids are pinned, and the seed never renumbers an account that already exists. Three
things can happen, and the seed says which:

- **The account is absent and the pinned ids are free.** It is created at them. This is every
  fresh deployment.
- **The account is already there.** It is adopted exactly as it is, whatever its ids.
- **The account is absent but a pinned id is taken** — most often a deployment whose first
  administrator holds `user.id` 1. It is created at generated ids and the seed prints a note.

Divergent ids cost nothing at runtime: `issue_token.js`, the grant service, the seed, and
the backfill migration all resolve the account by username, never by the constants. Issue the
worker token after seeding, and reissue it if the account is ever recreated.

The one case that refuses is another user holding `svc_tasks@iu.edu` or the `svc_tasks`
`cas_id` under a different username. That is a collision a person has to resolve, so the
seed stops and names the row.

## The user files

Put the people who should exist on day one in three files in the `api/` directory. Each
file is a JSON array, and the file a person appears in decides their role.

| File | Role |
| --- | --- |
| `admins.json` | `admin` |
| `operators.json` | `operator` |
| `users.json` | `user` |

Every entry needs `name`, `username`, and `email`:

```json
[
  {
    "name": "Ada Lovelace",
    "username": "alovelace",
    "email": "alovelace@iu.edu"
  }
]
```

`username` is also written to `cas_id`, which is what the CAS login flow matches on. A
missing or empty file is skipped.

An existing user is never modified. A name, an email, or a role changed through the admin
panel is the current truth, and a stale file left on the server does not reverse it on the
next deploy. To change an existing user, use the admin panel.

The seed refuses, rather than guessing, when two entries share an email or a username, and
when the same person appears in two files. The second case is a request for two roles, and
resolving it by file order would silently drop one. Every problem in every file is
reported in one pass.

All three files are gitignored, because they name real people.

## The import sources file

`import_sources.json` lists the instrument drop directories the API may import datasets
from. It is optional; leave it out and the seed skips it.

```json
[
  {
    "path": "/data/bioloop/genomics",
    "label": "Genomics Lab",
    "description": "Instrument drop directory for the genomics lab",
    "sort_order": 1,
    "mounted_path": "/opt/sca/data/imports/genomics"
  }
]
```

- `path` is required, must be absolute, and must be unique. It is the canonical path shown
  in the UI, and it is stored as the `origin_path` of every dataset imported from the
  source, which a worker later archives from.
- `mounted_path` is where the API process actually finds the directory, when a container
  mount puts it somewhere other than `path`. Omit it when the two are the same.
- `label`, `description`, and `sort_order` are optional. Lower `sort_order` values appear
  first; omit it to sort last.

Unlike users, these fields are refreshed on every run, because an import source is
deployment configuration rather than a record someone maintains in the UI. The `status` and
owning group of an existing source are left alone: a platform admin sets those once the
groups exist.

The API container also needs a volume mount for each path. See
[Import sources](../reference/features/import_sources.md) for that half.

## Adding to the baseline

New reference data belongs in `api/prisma/seed_baseline.js`, so that production and
development both get it. Two rules keep it safe to re-run.

Every write is an upsert or a `createMany` with `skipDuplicates`. Nothing in the file may
assume it is running against an empty database.

Anything inserted at an explicit id needs its sequence realigned, at the end of
`seedBaseline()`. Postgres does not advance an identity sequence for a row given an explicit
id, so the next generated id collides.

`api/tests/seed_baseline.test.js` covers the validation and asserts the configuration is
self-consistent — every preset names access types that exist, every implication names a real
access type, every user file confers a real role. It needs no database.
