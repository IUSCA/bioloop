---
name: prisma-schema-changes
description: Operational technique for changing the Prisma schema in this repository - writing a migration by hand, the defaults and constraints Prisma cannot express, how a validity column silently breaks relation reads, why a seeded sentinel id has to parse as a real UUID, and how to recover a failed migration or reset the dev database. Use when editing api/prisma/schema.prisma, adding a migration under api/prisma/migrations, changing api/prisma/seed.js or api/prisma/seed_baseline.js, or touching anything that reads group_user, collection_dataset, or the effective-access views.
---

# Changing the Prisma schema

Migrations are written by hand, because partial unique indexes, generated columns, views, and
check constraints cannot be expressed in `schema.prisma`. The reasoning and worked examples
behind every rule here are in `docs/contributing/techniques/prisma-schema-changes.md`.

Run everything from `api/`.

## The loop that works

1. Edit `prisma/schema.prisma`.
2. `npx prisma format && npx prisma validate`.
3. Write `prisma/migrations/<timestamp>_<name>/migration.sql` by hand.
4. `npx prisma migrate dev --name <name> --skip-generate`.
5. **Read what it printed.** If it also *created* a migration, the schema and database
   disagree and Prisma wrote SQL to close the gap. That SQL is usually wrong. Delete the
   generated directory and fix the schema to describe what the database has.
6. `npx prisma generate`.
7. `bin/devserver.sh restart api`. Nodemon crashes during steps 1–6 with
   `Cannot register virtual attribute loader: <name> is a column or relation`. That is a
   stale client, not a failed change.
8. `npm run test:db:setup`, so `app_test` gets the migration too.

**Drift check:** after a reset, `npx prisma migrate dev --name drift_check --create-only`. A file
saying `-- This is an empty migration.` means no drift; delete it.

## Things Prisma will not do for you

- **`@default(uuid())` is client-side.** Raw SQL inserts get no id. Tables written with
  `$queryRaw` (memberships, collection contents, grants) need a database default, declared in
  the schema as `@default(dbgenerated("(gen_random_uuid())::text"))`. Otherwise the next
  `migrate dev` generates `DROP DEFAULT`.
- **Copy a `dbgenerated` expression's parenthesisation from `\d <table>`.** Prisma treats
  `gen_random_uuid()::text` and `(gen_random_uuid())::text` as drift.
- **A partial unique index must be named in `ON CONFLICT`**, predicate included:
  `ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING`.
- **A partial unique index lives only in the migration.** Prisma cannot express a `WHERE`
  clause, does not introspect such an index, and leaves it alone. A stand-in `@@unique` in the
  schema is permanent drift. Comment on the model where the index is.
- **`NULLS NOT DISTINCT` is the opposite case: you MUST declare the `@@unique`.** Prisma does
  introspect a plain unique index, so an undeclared one is drift it closes by dropping the
  index — `migrate dev` writes and applies a `DROP INDEX` of its own, silently removing the
  constraint. Declare it with the migration's own index name,
  `@@unique([parent_id, name], map: "group_parent_id_name_key")`. Prisma ignores the
  nulls-not-distinct property itself, so the declaration is not drift; verified on Prisma
  6.19 against `group_parent_id_name_key`, where `migrate dev --create-only` then reports an
  empty migration.
- **`has` filters only scalar lists** such as `grant_preset.resource_types`. On a relation it
  fails at runtime with a 500; use `{ some: { ... } }`.
- **A CHECK lives only in the migration.** Name it in a comment on the column. A NULL passes
  it. Prisma gives a violation (`23514`) no code of its own; `prismaConstraintFailedHandler`
  answers it 409 with a generic message. Refuse a user-reachable case in the service first,
  with a message that says why. A refusing trigger raises `ERRCODE = 'check_violation'` to get
  the same answer.
- **A nested relation `create` rejects a sibling scalar foreign key** with
  `Argument 'owner_group' is missing`. Use `owner_group: { connect: { id } }`.
- **Changing a compound unique key renames its lookup** (`name_type_is_deleted` ->
  `owner_group_id_name_type_is_deleted`). Grep for the old key name, including `prisma/seed.js`.
  Replacing one with a partial index removes the lookup entirely; the same grep applies.
- **Dropping a composite key breaks `upsert`s in `seed.js`**, only at the end of a reset. Use
  `createMany({ data, skipDuplicates: true })`.

## Validity columns silently break relation reads

After a table gains `removed_at` or `valid_until`, every Prisma relation read keeps returning
closed rows, with no error. A removed admin keeps authority.

- Readers use a view (`active_group_user`), never an ad-hoc `WHERE`. Raw SQL swaps in the view;
  Prisma client reads add `removed_at: null`; writes use the base table.
- Rebuild `effective_user_groups` and `effective_user_oversight_groups` on the active view in
  the same migration, or expired memberships keep conferring access.
- Rename the raw relation (`group_membership_history`) and expose the safe read under the old
  name as a hydrator virtual attribute. Rename first; `registerVirtualAttribute` refuses a name
  that collides with a model field.
- Grep for the base table name afterwards. Every hit must be a write or a history query.

## Writing rows by hand

- Supply `(gen_random_uuid())::text` for client-defaulted keys.
- `grant.granted_by` references `user.subject_id`, not `subject`. A group id violates it. Use the
  `svc_tasks` account for system-issued rows.
- Guard inserts with `NOT EXISTS` so a rerun adds nothing; `grant_no_overlap` makes a second run
  an error.
- **Adding `NOT NULL` to a populated table:** add with a temporary `DEFAULT`, then
  `DROP DEFAULT` in a second `ALTER`. If the seed fills the column, its upsert's `update` branch
  must write it too.

## Seeds and lookup rows

- **Lookup rows come from `prisma/seed_baseline.js`, never a migration.** Seeds run after
  migrations, so a migration joining a lookup table writes nothing on a fresh database, silently.
  Put the data in `src/constants.js`. Lookup rows only in `seed.js` never reach production.
- **A backfill is written in three places:** the service, the migration, and `prisma/seed.js`,
  which builds rows as plain objects. Missing the seed fails a reset with
  ``Argument `x` is missing``.
- **Seed referenced tables first**, and never "create here, correct later in the same run".
- **Derive deterministic seed values from columns you wrote**, never from a generated uuid.
- **Deleting lookup rows: count references before deleting.** A `RESTRICT` violation is Postgres
  `23001`, which Prisma surfaces with no `code`, so a `catch` for `P2003` misses it. Retired
  presets still reference their types.

## Sentinel ids must be real UUIDs, prefixed `ffffffff`

`isUUID()` checks version and variant nibbles, so `00000000-0000-0000-0000-000000000001` lists
but its detail route returns 400. A zero prefix also collides with ids the deterministic seed
generator emits. Use `ffffffff-0000-4000-8000-00000000000N`, keep it in the sentinel block in
`src/constants.js`, and assert `validator.isUUID(id)` and `!id.startsWith('00000000')`.

A column both v1 and v2 write may be `NOT NULL` only with a **database default naming a seeded
sentinel row** that exists before the first insert, as `dataset.owner_group_id` does.

## When a migration goes wrong

- **Unmerged and run only locally:** edit it in place and reset. Say so in the commit message.
  Once it has run anywhere else it is frozen; write a new migration.
- **Failed part-way:** `migrate dev` then demands a reset, and `migrate resolve --rolled-back`
  leads to P3009. On a dev database, delete the row and redeploy. Nothing partial is left,
  because each migration is one transaction.

  ```sh
  psql ... -c "DELETE FROM _prisma_migrations WHERE migration_name = '<name>';"
  npx prisma migrate deploy
  ```

- **A migration that only drops objects needs no reset.** Apply with `migrate deploy`. Drop
  views, then child tables, then parents, each `IF EXISTS`. Verify in
  `information_schema.tables` on both databases, because `deploy` reports success when nothing
  was dropped. Grep the repo for every dropped name.

## Resetting the dev database

Prisma refuses `migrate reset` from an agent. **Ask the user for consent in its own question.**
Only after they consent in a message, run:

```sh
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<the user's exact consent text>" \
  npx prisma migrate reset --force --skip-generate
```

The variable holds that message's exact words, with no newlines or quotes. Earlier messages do
not count. A reset crashes the running API; restart it. Treat new test failures after a reset
as real until shown otherwise.

## Test a migration against a clone before it reaches a real database

Never reason about whether a migration set will apply to a populated database. Restore a dump
into a throwaway container on that database's own major version and run the real
`prisma migrate deploy` against it.

```bash
pg_dump -h "$HOST" -U "$USER" -d "$DB" --no-owner --no-privileges --schema=public -f /tmp/d.sql
grep -v '^CREATE SCHEMA public;$' /tmp/d.sql > /tmp/restore.sql   # else the restore aborts
docker run -d --name replica -e POSTGRES_PASSWORD=pw -e POSTGRES_USER=bioloop \
  -e POSTGRES_DB=bioloop-dev -p 55432:5432 postgres:14.5
psql -h localhost -p 55432 -U bioloop -d bioloop-dev -f /tmp/restore.sql
cd api && DATABASE_URL='postgresql://bioloop:pw@localhost:55432/bioloop-dev?schema=public' \
  npx prisma migrate deploy
```

Three things this catches that reading the SQL does not.

A schema-only dump is not enough. Migrations that add a NOT NULL column or tighten a unique
index only fail when rows are present, so dump the data too.

Two lineages that each renamed the same thing collide. Compare `_prisma_migrations` against
the migrations directory in both directions: a migration applied in the database but absent
from the branch means the two histories forked, and the branch's replacement for it will fail
on objects that are already gone. `docs/operations/cdmd-v2-cutover.md` works one of these
through.

Finish the rehearsal past `migrate deploy`. Run `npm run seed:prod` and boot the API, because
`validateGrantAccessTypes` refuses to start on a migrated but unseeded database. Then run
`prisma migrate diff --from-url <replica> --to-schema-datamodel prisma/schema.prisma`; anything
but `-- This is an empty migration.` means the migrations and the schema file disagree.

## Keeping this current

When a session in this area hits something this page does not mention — a constraint Prisma
would not express, a migration that had to be split, a reader that was missed — amend this
file in the same change, and put the explanation in
`docs/contributing/techniques/prisma-schema-changes.md`. Record dead ends explicitly, and verify
a claim against the running database before writing it down here.
