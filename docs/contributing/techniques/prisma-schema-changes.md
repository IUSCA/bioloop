---
title: Changing the Prisma Schema
---

# Changing the Prisma Schema

This page explains how schema changes are made in `api/prisma`, and why each of their traps
behaves the way it does. The short operational checklist lives in the `prisma-schema-changes`
agent skill at `.claude/skills/prisma-schema-changes/SKILL.md`. This page holds the reasoning
and the detail behind it.

Migrations here are written by hand. Several things the schema depends on cannot be expressed
in `schema.prisma`: partial unique indexes, generated columns, database views, and check
constraints. The schema file mentions them in comments. The migration SQL is where they live.

Run every command from `api/`.

## The loop

1. Edit `prisma/schema.prisma`.
2. Run `npx prisma format && npx prisma validate`.
3. Write `prisma/migrations/<timestamp>_<name>/migration.sql` by hand.
4. Run `npx prisma migrate dev --name <name> --skip-generate`. It applies the file you wrote.
5. Read what it printed. If it also *created* a migration, the schema and the database still
   disagree, and Prisma has written SQL to close the gap. That SQL is usually wrong. Delete the
   generated directory, and fix the schema so it describes what the database has. The two
   usual causes are a client-side default and a default written with different
   parentheses. Both are described below.
6. Run `npx prisma generate`.
7. Restart the API with `bin/devserver.sh restart api`.
8. Run `npm run test:db:setup` so `app_test` gets the migration too.

### Checking for drift

Run `migrate reset`, then `npx prisma migrate dev --name drift_check --create-only`. A file
containing `-- This is an empty migration.` means the schema and the database agree. Delete
that file afterwards.

## Defaults and keys Prisma does not handle

### `@default(uuid())` lives in the client

Prisma generates a `uuid()` default in the client, so the column has no `DEFAULT` in Postgres.
A row inserted by raw SQL gets no value, and the `NOT NULL` key fails. Membership, collection
contents, and grants are all written with raw SQL. Such a table needs a database default:

```sql
ALTER TABLE "group_user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
```

The schema then has to declare what the database has. Otherwise the next `migrate dev` sees a
default that `@default(uuid())` does not account for, and generates `DROP DEFAULT`:

```prisma
id String @id @default(dbgenerated("(gen_random_uuid())::text"))
```

The client then stops generating ids, and the database supplies them. The parentheses matter,
as the next section explains.

### The rendering must match Postgres exactly

`dbgenerated("gen_random_uuid()::text")` and the default Postgres reports,
`(gen_random_uuid())::text`, are the same expression. Prisma still treats the difference as
drift, so every `migrate dev` generates a migration that sets the default to itself. Copy the
parentheses from `\d <table>`, or from `information_schema.columns.column_default`.

A literal default is different. Prisma renders `@default("ffffffff-...")` as `'value'::text`,
which matches Postgres. Confirm with the drift check rather than assuming.

### A partial unique index must be named in `ON CONFLICT`

After a composite primary key becomes a partial unique index, `ON CONFLICT (a, b) DO NOTHING`
no longer infers a target, and the statement fails. Repeat the index predicate:

```sql
ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING
```

### Dropping a composite key breaks the seed

`prisma/seed.js` builds rows as plain objects and calls `upsert` with compound keys. After a
composite key is dropped, seeding fails at the end of a reset.
`createMany({ data, skipDuplicates: true })` works against a partial unique index and is the
smaller change.

### Changing a compound unique key renames its lookup

Prisma names a compound unique key after its fields. Moving `@@unique([name, type,
is_deleted])` to `@@unique([owner_group_id, name, type, is_deleted])` renames the lookup from
`name_type_is_deleted` to `owner_group_id_name_type_is_deleted`. Every `findUnique` and
`upsert` naming the old key breaks. Grep for the old key name, not the field list:

```sh
grep -rn "name_type_is_deleted" --include='*.js' . | grep -v node_modules
```

Where a caller's meaning is deliberately global, `findFirst` on the same fields preserves it.

### Uniqueness over a nullable column

Postgres treats every NULL as distinct. Without extra care, the same row with a NULL column can
be inserted repeatedly. `docker-compose.yml` runs Postgres 18, so `NULLS NOT DISTINCT` is
available. It arrived in Postgres 15. On an older server the error is a bare
`syntax error at or near "NULLS"`, which reads like a typo.

Prisma models neither `NULLS NOT DISTINCT` nor a partial unique index. Either one lives in the
migration alone. The existing idiom is a pair of partial unique indexes, as on
`dataset_funding` in `20260908070000_dataset_attribution`:

```sql
CREATE UNIQUE INDEX "dataset_funding_dataset_funder_award_key"
    ON "dataset_funding"("dataset_id", "funder", "award_number")
    WHERE "award_number" IS NOT NULL;
CREATE UNIQUE INDEX "dataset_funding_dataset_funder_no_award_key"
    ON "dataset_funding"("dataset_id", "funder")
    WHERE "award_number" IS NULL;
```

Do not add a plain `@@unique` to `schema.prisma` to stand in for these, because that produces
permanent drift. Leave a comment on the model saying where the real indexes are.
`createMany({ skipDuplicates: true })` still respects them, because it emits
`ON CONFLICT DO NOTHING` with no target.

## Relations and filters

### Relations cannot be filtered at the schema level

This is the dangerous one. After a table gains a `removed_at` or `valid_until` column, every
Prisma relation read still returns closed rows, silently. `user.group_memberships` feeds the
owning-group-admin policy check. An unfiltered relation would let a removed admin keep their
authority with no error anywhere.

The schema handles this with a rename and a virtual attribute. The raw relation on `user` is
`group_membership_history`, and `active_group_memberships` reads the `active_group_user` view.
`src/authorization/builtin/hydrators/user.js` registers `group_memberships` as a hydrator
virtual attribute. The safe read keeps the name every caller already uses. The unfiltered read
has to be asked for deliberately. `PrismaHydrator.registerVirtualAttribute` refuses a name that
collides with a real model field, so the rename comes first.

### Views are the choke point for "currently in force"

When a table gains validity columns, do not add a `WHERE` clause to every query that reads it.
Create a view and point the readers at it:

```sql
CREATE OR REPLACE VIEW active_group_user AS
SELECT * FROM group_user
WHERE removed_at IS NULL
  AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP);
```

- Raw SQL reads swap the table name for the view.
- Prisma client reads take an explicit `removed_at: null`.
- Writes keep using the base table.

After the change, grep for the base table name. Every remaining hit should be a write or a
deliberate history query. `effective_user_groups` and `effective_user_oversight_groups` must be
rebuilt on top of the active view in the same migration. Otherwise expired memberships keep
conferring access. `CREATE OR REPLACE VIEW` works only while the column list is unchanged.

### `has` filters only scalar lists

Prisma accepts `has` on a scalar list, such as `grant_preset.resource_types`, which is an
enum array. On a relation it is a validation error at runtime. The `access_request` hydrator
once filtered the `access_requests` relation with `has`, and `GET /access-requests/:id`
returned a 500 for every caller who was not a platform admin. A relation takes `some`:

```js
where: { access_requests: { some: { id } } }
```

### A nested relation create rejects a scalar foreign key

`prisma.dataset.create({ data: { resource: { create: {...} }, owner_group_id: '...' } })`
fails with `Argument 'owner_group' is missing`. Once one relation uses nested form, the whole
create uses the relation input variant, and a sibling scalar foreign key is not accepted.
Connect the relation instead:

```js
owner_group: { connect: { id: UNASSIGNED_DATASETS_GROUP_ID } }
```

This mostly bites in `prisma/seed.js`, and it surfaces only at the end of a reset.

## Columns and constraints

### Indexes Prisma cannot express, and the two opposite answers

Two index features this repository uses cannot be written in `schema.prisma`, and they need
opposite handling. Getting it backwards silently removes a constraint.

**A partial unique index stays out of the schema.** Prisma cannot express a `WHERE` clause, and
it does not introspect an index that has one, so the index is invisible to drift detection and
survives untouched. `dataset_live_name_key`, from
`20260917030000_dataset_live_name_unique`, is one. Write it in the migration, and put a comment
on the model saying where it lives. Adding a stand-in `@@unique` describes an index that does
not exist and becomes permanent drift.

**A `NULLS NOT DISTINCT` index must be declared.** The clause is the only part Prisma cannot
express; the index itself is an ordinary unique index over two columns, and Prisma does
introspect those. An undeclared one is therefore drift, and the way Prisma closes that drift is
to drop it. Running `migrate dev` after adding `group_parent_id_name_key` by hand produced a
second migration containing one statement, `DROP INDEX "group_parent_id_name_key"`, and applied
it. The constraint was gone and nothing said so.

The fix is to declare it with the migration's own index name:

```prisma
@@unique([parent_id, name], map: "group_parent_id_name_key")
```

Prisma then sees an index it expects and leaves the nulls-not-distinct property alone.
Verified on Prisma 6.19: after declaring it, `migrate dev --create-only` writes
`-- This is an empty migration.`

The property is load-bearing rather than cosmetic. `group.parent_id` is NULL for a root group,
and a plain unique index treats every NULL as distinct, so two roots could share a name. Tested
on PostgreSQL 18.6: the plain index admitted a second root named `CDMD`, and the
nulls-not-distinct index refused it while still allowing the same name under two different
parents. `NULLS NOT DISTINCT` needs PostgreSQL 15 or newer.

### A NOT NULL column both halves can write

A constraint that only v2 code needs normally lives in the service, because v1 routes write the
same table. One shape lets it live in the column: a `NOT NULL` with a database default naming a
seeded sentinel row. `dataset.owner_group_id` works this way.
`20260910010000_group_scoped_dataset_names` makes it `NOT NULL` with a default pointing at the
seeded `Unassigned Datasets` group. A v1 insert omits the column, and Postgres supplies the
sentinel. A `NOT NULL` with no default breaks v1 creation, which sends no owning group.

Check two things before reaching for this:

- **The default must be a real row that exists before the first insert.** A foreign key does
  not care that the value came from a default. Create the sentinel earlier in the same
  migration, or in an earlier one, guarded with `ON CONFLICT DO NOTHING`.
- **An explicit `NULL` still fails, and that is correct.** The default covers a caller that
  omits the column. Say so in the test, because the two cases read alike.

### A CHECK constraint

`schema.prisma` cannot declare a CHECK, so it lives only in the migration. Prisma does not see
it, and `migrate dev` reports no drift for it. Name the constraint in a comment on the column,
because nothing else in the schema says the column is restricted.

Two properties decide how to write one and how to surface it:

- **A NULL passes a CHECK.** `NULL NOT IN (...)` is NULL, which Postgres treats as satisfied.
  A nullable column therefore keeps admitting "none" with no extra clause. Two nullable columns
  in one CHECK joined by `AND` still refuse a bad value in either one, because
  `NULL AND FALSE` is FALSE. `grant_authority_not_system_principal` relies on this, and
  `tests/services/groups/systemPrincipals.test.js` sets one column and leaves the other NULL.
- **Prisma gives a CHECK violation no code of its own.** Postgres reports `23514`. A client
  query throws `PrismaClientUnknownRequestError`, with `code` undefined and the Postgres code
  only inside the message. A raw query throws `P2010` with the Postgres code in `meta.code`.
  `prismaConstraintFailedHandler` in `api/src/middleware/error.js` recognises both and answers
  409 with a generic message, because the Postgres message names the constraint and echoes the
  failing row. That answer says nothing about why, so refuse a case a user can reach in the
  service first, with a message that says why. Tests match the constraint name in the message.

A trigger that refuses a write can raise the same code, with
`RAISE EXCEPTION ... USING ERRCODE = 'check_violation'`, so the middleware answers it the same
way. `system_principal_immutable` does this. Its message reaches Prisma but its `CONSTRAINT`
name does not, so tests match the message text.

### A NOT NULL column on a populated lookup table

`grant_access_type` has `category`, `sort_order`, and `is_requestable`, all `NOT NULL` and all
supplied by the seed. The migration runs before the seed, so on a populated database the rows
already exist, and a plain `ADD COLUMN ... NOT NULL` fails. Add each column with a temporary
default, then drop the default:

```sql
ALTER TABLE "grant_access_type"
  ADD COLUMN "category" "GRANT_ACCESS_TYPE_CATEGORY" NOT NULL DEFAULT 'DATASET_ABOUT',
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "grant_access_type"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "sort_order" DROP DEFAULT;
```

The schema declares no default, which matches the database. The placeholder values last only
until the seed's upsert overwrites them. So the seed's `update` branch must write the new
columns, not only its `create` branch.

A Postgres enum sorts in declaration order, not alphabetically. `orderBy: { category: 'asc' }`
follows the order of the values in `schema.prisma`. The enum is therefore a legitimate place to
encode display order.

### Writing rows by hand

A data migration or backfill that inserts into an existing table has to satisfy what the
Prisma client normally handles.

- **Supply client-side defaults yourself.** Write `(gen_random_uuid())::text` for a key whose
  schema default is `uuid()`.
- **Check what a provenance foreign key points at.** `grant.granted_by` is `NOT NULL` and
  references `user.subject_id`, not `subject`. A group is a subject and passes the eye test,
  and then violates the constraint. For a row the system issues, use the `svc_tasks` service
  account, which `prisma/seed_baseline.js` creates in every environment.
- **Make the insert re-runnable.** Guard it with `NOT EXISTS`. The `grant_no_overlap` exclusion
  constraint turns a careless second run into an error.

## Seeds and lookup rows

### Lookup rows come from the seed

`prisma/seed_baseline.js` populates `grant_access_type`, `grant_access_type_implication`,
`grant_preset`, the roles, and the `svc_tasks` account. It runs after every migration.
`prisma/seed.js` calls it and adds development rows on top. `npm run seed:prod` runs it alone.

A migration that inserts into a table joined against lookup rows writes nothing on a fresh
database, silently, because the lookup table is still empty. Check the row count after a reset.

Put new lookup data in `src/constants.js` next to `GRANT_ACCESS_TYPES`. Seed it in
`seed_baseline.js` right after the rows it references. Let the migration create only the table.
Lookup data placed in `seed.js` never reaches production. `api/tests/seed_baseline.test.js`
asserts the seeded rows match the constants, and it needs no database.

### A backfill is written in three places

The same rule applies to a derived row or a new column that existing rows need:

- the service that creates the row from now on,
- the migration, for rows that already exist, and
- `prisma/seed.js`, for rows the seed writes directly.

`group.archive_key` shows the shape. The migration sets it for existing groups. `createGroup()`
in `src/services/groups.js` sets it for new ones. `seed.js` sets it in its own `upsert`, because
it builds group rows as plain objects. Leaving out the seed gives a reset that fails with
``Argument `archive_key` is missing``, or a database quietly inconsistent with every other
environment.

### Seed a table before the tables that reference it

`prisma/seed.js` seeds groups before datasets, because a dataset is created in the group that
owns it. A "create it here, correct it later in the same run" pass is a smell. The corrected
column is usually part of a key that something reads in between. Seeding datasets into a
placeholder group and reassigning them afterwards causes three defects:

- The dataset upsert keys on the placeholder group, so a second run matches nothing and hits
  duplicates.
- Collections are generated from rows read before the reassignment, so they come out empty.
- Ownership chosen from a generated column differs on every reset.

**Derive a deterministic seed value from a column you wrote, never from one the database
generated.** `dataset.resource_id` carries a client-side `uuid()` default and changes every
reset. `seed_data/groups.js` exports `ownerGroupIdForDataset`, which reads `dataset.name`.

When a seed must tolerate rows an earlier version of itself wrote, look the row up by the fields
that did not change and update the rest. Do not upsert on a key whose value has since changed.

### Deleting lookup rows the seed no longer lists

`seed_baseline.js` deletes access types missing from `GRANT_ACCESS_TYPES`. Grants, access
request items, and preset items reference them with `RESTRICT` foreign keys.

Postgres reports a `RESTRICT` violation as `23001`, not the `23503` that Prisma maps to `P2003`.
Prisma surfaces it as a `PrismaClientUnknownRequestError` with no `code`. A `catch` testing for
`P2003` rethrows it, and the seed dies with a stack trace. So the seed counts the referencing
rows first and calls `refuse` with the stale names.

A retired preset still counts. Presets are retired with `is_active: false`, never deleted. Their
items keep naming the old type, and only a database reset clears them.

## Sentinel ids

A seeded system row with a memorable id is tempting to write as
`00000000-0000-0000-0000-000000000001`. Postgres stores it happily, because the column is
`text`. Route validation does not accept it. `express-validator`'s `isUUID()` checks the version
and variant nibbles, so the row lists but its detail page returns 400.

The leading bytes must not be zero either. `createDeterministicUuidGenerator` in
`prisma/seed_data/deterministic_uuid.js` counts up from zero in a UUID's last eight bytes and
sets exactly those nibbles. `00000000-0000-4000-8000-000000000001` is then both a tidy sentinel
and the id the seed assigns to an ordinary row in another table. Nothing fails. The collision
shows only when a grant's subject and resource ids are read side by side.

Prefix a sentinel with `ffffffff`, which the generator never reaches, as in
`ffffffff-0000-4000-8000-000000000001`. `AUTHENTICATED_USERS_GROUP_ID` breaks both rules. It
keeps its value only because changing it would orphan every grant and audit record naming it.
`src/constants.js` states both rules in a comment above the sentinel block. Keep new sentinels
inside that block, and assert both rules next to the seeded row's other checks:

```js
expect(validator.isUUID(UNASSIGNED_DATASETS_GROUP_ID)).toBe(true);
expect(UNASSIGNED_DATASETS_GROUP_ID.startsWith('00000000')).toBe(false);
```

## Migrations that go wrong

### Correcting a migration that has run only locally

A migration on an unmerged branch that has run only on the disposable development database is
not history worth keeping. Edit it in place and reset, rather than adding a follow-up migration
that corrects it. Say so in the commit message, because the change is invisible in a diff of a
later commit. Once a migration has run anywhere else, it is frozen, and the correction is a new
migration.

### A failed migration blocks the next attempt

When a data migration fails part-way, Prisma records the attempt. Rerunning `migrate dev` after
fixing the SQL does not retry it. Prisma sees a changed checksum and asks to reset the whole
database. `migrate resolve --rolled-back` is not enough either. It leaves the row in place, and
`migrate deploy` then refuses with P3009.

On a development database, delete the row and deploy:

```sh
psql ... -c "DELETE FROM _prisma_migrations WHERE migration_name = '<name>';"
npx prisma migrate deploy
```

Postgres runs each migration in a transaction. A migration that failed on any statement wrote
nothing, so there is no partial state to undo.

### Dropping tables and views needs no reset

A migration that only drops objects applies with `prisma migrate deploy` like any other. A reset
is needed to *rewrite* a migration that already ran, not to add one that drops things.
`20260916010000_drop_restriction_layer` is an example. The test database takes it through
`npm run test:db:setup`.

- **Drop in dependency order.** Views first, then the child table, then the table its foreign
  key points at. Use `IF EXISTS` on each, so a half-applied migration can rerun.
- **Verify against the system catalog.** `migrate deploy` reports success for a file whose
  statements all hit `IF EXISTS` and did nothing. Query `information_schema.tables` for every
  dropped name, on both databases, and expect an empty result.
- **Say in the migration header what the rows held and where the surviving record is.**
  Otherwise a reviewer cannot tell whether anything was lost. Read the table's contents before
  writing that claim.
- **Grep the repository for every dropped table and view name.** Schema comments and seed
  docstrings keep describing a dropped object long after the migration.

## The dev server during a schema change

Between editing `schema.prisma` and finishing `npx prisma generate`, nodemon reloads against a
stale client. The API dies with an error such as
`Cannot register virtual attribute loader: <name> is a column or relation in the Prisma model`.
Nodemon then waits for a file change that already happened. This is not a real error. Finish
`prisma generate`, then run `bin/devserver.sh restart api`. The `dev-servers` skill covers the
script.

To check the generated client has the change:

```sh
node -e "const {Prisma}=require('@prisma/client');
console.log(Prisma.dmmf.datamodel.models.find(m=>m.name==='user').fields.map(f=>f.name))"
```

## Resetting the development database

Development data is disposable and comes from `api/prisma/seed_data`. Prisma refuses a reset
from an AI agent:

```sh
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<the user's exact consent text>" \
  npx prisma migrate reset --force --skip-generate
```

The variable holds the exact words of the message in which the user consented, with no newlines
or quotes. Earlier messages do not count. Ask for the consent in its own question first.

A reset re-seeds, which can unmask test bugs a long-lived database hid. A suite may have passed
only because a table happened to hold one kind of row. Treat new failures after a reset as real
until shown otherwise. A reset also crashes a running API mid-run, so restart it afterwards.
