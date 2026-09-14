---
name: prisma-schema-changes
description: Operational technique for changing the Prisma schema in this repository - writing a migration by hand, the defaults and constraints Prisma cannot express, how a validity column silently breaks relation reads, why a seeded sentinel id has to parse as a real UUID, and how to reset the dev database. Use when editing api/prisma/schema.prisma, adding a migration under api/prisma/migrations, changing api/prisma/seed.js or api/prisma/seed_baseline.js, or touching anything that reads group_user, collection_dataset, or the effective-access views.
---

# Changing the Prisma schema

Migrations here are written by hand and applied with `--create-only`-style control, because
several things this schema depends on cannot be expressed in `schema.prisma`: partial unique
indexes, generated columns, database views, and check constraints. The schema file documents
them in comments; the migration SQL is where they live.

Run everything from `api/`.

## The loop that works

1. Edit `prisma/schema.prisma`.
2. `npx prisma format && npx prisma validate`.
3. Write `prisma/migrations/<timestamp>_<name>/migration.sql` by hand.
4. `npx prisma migrate dev --name <name> --skip-generate` — applies the file you wrote
   rather than generating one.
5. **Read what it printed.** If it says it *created* a migration as well as applying yours,
   the schema and the database still disagree and Prisma has written SQL to close the gap.
   That SQL is usually wrong. Delete the generated directory, fix the schema so it
   describes what the database actually has, and reset rather than layering a correction on
   top. The two causes seen here are a client-side default Prisma wants to drop and a
   default written with different parenthesisation; both are below.
6. `npx prisma generate`.
7. **Restart the API before anything else touches it** — see the crash below.

## Five things Prisma will not do for you

**`@default(uuid())` is generated in the client, not the database.** Any row inserted by raw
SQL gets no default, so a `NOT NULL` surrogate key fails. Every table this repository writes
through `tx.$queryRaw` needs an explicit database default:

```sql
ALTER TABLE "group_user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
```

Membership, collection contents, and grants are all written with raw SQL. Check before
assuming a Prisma default is enough.

**Prisma reads that database default as drift.** Having added it, the next `migrate dev`
sees a default in the database that `@default(uuid())` does not account for and generates
`ALTER COLUMN "id" DROP DEFAULT` — quietly undoing the fix one phase later. Declare what
the database actually has, so the two agree:

```prisma
id String @id @default(dbgenerated("gen_random_uuid()::text"))
```

The client then stops generating ids and the database supplies them, which is what the raw
inserts needed in the first place.

**A partial unique index must be named in `ON CONFLICT`.** After replacing a composite
primary key with a partial unique index, `ON CONFLICT (a, b) DO NOTHING` no longer infers
anything and the statement fails. Repeat the index predicate:

```sql
ON CONFLICT (group_id, user_id) WHERE removed_at IS NULL DO NOTHING
```

**Prisma relations cannot be filtered at the schema level.** This is the dangerous one. Add
a `removed_at` or `valid_until` column and every relation read keeps returning closed rows,
silently. `user.group_memberships` feeds the owning-group-admin policy check, so a removed
admin would have kept their authority with no error anywhere.

The fix that holds: rename the raw relation to something that says what it is
(`group_membership_history`), and expose the filtered read under the obvious name as a
hydrator virtual attribute backed by the active view. The safe read then keeps the name
every caller already uses, and the unfiltered one has to be asked for deliberately.
`PrismaHydrator.registerVirtualAttribute` refuses a name that collides with a real model
field, so the rename has to come first.

**A composite key you drop is still referenced by the seed script.**
`prisma/seed.js` used `upsert({ where: { group_id_user_id: ... } })`. Dropping the composite
primary key breaks seeding, which only surfaces at the end of a reset. `createMany({ data,
skipDuplicates: true })` works against a partial unique index and is the smaller change.

## A NOT NULL column both halves can write: use a database default

A constraint only the new code needs normally has to live in the service, because the legacy
routes write the same table. There is one shape where it can live in the column instead: give
the column a `NOT NULL` and a **database default** naming a seeded sentinel row.

`dataset.owner_group_id` is the worked example. Migration `20260908010000` made it `NOT NULL`
with no default and broke legacy creation, which sends no owning group. `20260909010000`
reversed it. `20260910010000` made it `NOT NULL` *with* a default pointing at the seeded
`Unassigned Datasets` group, and legacy creation keeps working untouched — the insert omits
the column and Postgres supplies the sentinel.

Two things to check before reaching for this:

- **The default must be a real row, and it must exist before the first insert.** A foreign
  key does not care that the value came from a default. Create the sentinel earlier in the
  same migration, or in an earlier one, guarded with `ON CONFLICT DO NOTHING`.
- **An explicit `NULL` still fails, and that is correct.** The default covers a caller that
  omits the column, not one that insists on no value. Say so in the test, because the two
  cases read alike and only one of them is the compatibility guarantee.

Prisma renders a literal default as `'value'::text`, which matches what Postgres reports, so
`@default("ffffffff-...")` produces no drift. Confirm with the `--create-only` drift check
above rather than assuming.

## Changing a composite unique key renames its Prisma lookup

Prisma names a compound unique key after its fields, so moving `@@unique([name, type,
is_deleted])` to `@@unique([owner_group_id, name, type, is_deleted])` renames the client-side
lookup from `name_type_is_deleted` to `owner_group_id_name_type_is_deleted`. Every
`findUnique` and `upsert` that names the old key stops compiling against the new client.

Grep for the old key name, not for the field list:

```bash
grep -rn "name_type_is_deleted" --include=*.js . | grep -v node_modules
```

Both hits mattered and neither was obvious. `prisma/seed.js` used it in an `upsert` `where`,
which fails only at the end of a reset. A route used it in a `findUnique`; where the route's
meaning was deliberately global, `findFirst` on the same three fields preserves it exactly.

A backfill of this shape needs writing in three places, and a column added to a table the seed
writes directly needs the same. `group.archive_key` had to be set by the migration for
existing rows, by `createGroup()` for new ones, and by `prisma/seed.js`, which builds group
rows as plain objects rather than going through the service. Missing the third gives a
reset that fails on `Argument \`archive_key\` is missing`.

## Seed a table before the tables that reference it, not after

`prisma/seed.js` used to create every dataset in the `Unassigned Datasets` group and reassign
it to a real group at the end of the run, because groups were seeded further down the file.
One ordering mistake, three separate defects, none of which announced itself:

- **The seed could not be re-run.** The dataset upsert keyed on
  `owner_group_id_name_type_is_deleted` with the quarantine group's id. After the first run
  had moved every dataset elsewhere, the key matched nothing, all 24 datasets took the create
  branch, and the six carrying explicit `workflows` ids failed on a duplicate.
- **The seed was not reproducible.** The owning group was chosen by hashing
  `dataset.resource_id`, which carries a client-side `uuid()` default and is regenerated on
  every reset. No two seeded databases agreed on who owned what, so nothing about ownership
  could be asserted in a test.
- **Every collection came out empty.** `generateCollections()` buckets datasets by
  `owner_group_id`, and it was handed rows read before the reassignment ran. Measured: 20 of
  21 collections had zero datasets.

The fix was to move the groups block above the datasets block and derive the owning group
from `dataset.name`, which is the only identifier of a seeded row that survives a reset.

Two rules come out of it. **Derive a deterministic seed value from a column you wrote, never
from one the database generated** — a defaulted uuid is different every reset. And **a
"create it here, correct it later in the same run" pass is a smell**: the corrected column is
usually part of a key that something else reads in between.

When a seed must tolerate rows an earlier version of itself wrote, look the row up by the
fields that did not change and update the rest, rather than upserting on a key whose value
you have since altered.

## Lookup rows come from the seed, not from a migration

`grant_access_type`, `grant_preset`, and the roles are populated by
`prisma/seed_baseline.js`, which runs **after** every migration. `prisma/seed.js` calls it
and adds dev-only rows on top, and `npm run seed:prod` runs it alone. A migration that inserts into a table joined against one of
those writes nothing, silently, because the table it joins to is still empty at that point.

The symptom is a migration that applies without error and leaves the table empty. Check the
row count after a reset rather than assuming the `INSERT` worked.

Put new lookup data in `constants.js` next to `GRANT_ACCESS_TYPES`, seed it in
`seed_baseline.js` right after the rows it references, and let the migration create only the
table. Putting it in `seed.js` instead means production never gets it — that is how
`grant_access_type_implication`, which the authorization engine reads at evaluation time,
came to be missing from the old production scripts. A test asserting the seeded rows match
the constant catches the two drifting apart; `api/tests/seed_baseline.test.js` is where those
live, and it needs no database.

## Prisma's rendering of a database default has to match Postgres exactly

`@default(dbgenerated("gen_random_uuid()::text"))` and the column default Postgres reports,
`(gen_random_uuid())::text`, are the same expression written differently, and Prisma treats
the difference as drift. Every `migrate dev` then generates a migration that sets the
default to what it already is.

Copy the parenthesisation from the database:

```
\d group_user            -- or: select column_default from information_schema.columns ...
```

To confirm no drift is left, `migrate reset` and then
`npx prisma migrate dev --name drift_check --create-only`. A file containing
`-- This is an empty migration.` means the schema and the database agree; delete it.

## Sentinel ids have to be real UUIDs

A seeded system row with a memorable id — a quarantine group, a system principal — is
tempting to write as `00000000-0000-0000-0000-000000000001`. Postgres stores it happily,
because the column is `text`. Route validation does not: `express-validator`'s `isUUID()`
checks the version and variant nibbles, so a zero-filled id fails `param('id').isUUID()`
and the row is listable but its detail page returns 400.

**And the leading bytes must not be zero.** `createDeterministicUuidGenerator` in
`prisma/seed_data` counts up from zero in a UUID's last eight bytes and sets exactly those
version and variant nibbles, so `00000000-0000-4000-8000-000000000001` is both a tidy
sentinel and the id the seed assigns to `Collection 01`. The two rows live in different
tables, so nothing fails — the collision only shows up when you read a grant's subject and
resource ids side by side and find the same string meaning two different things.

Prefix a sentinel with `ffffffff`, which the generator can never reach:
`ffffffff-0000-4000-8000-000000000001`. `AUTHENTICATED_USERS_GROUP_ID` breaks both rules
and keeps its value only because changing it would orphan every grant and audit record
that names it.

`api/src/constants.js` carries both rules in a comment above the block; keep new sentinels
inside it.

Two checks worth writing, next to the seeded row's other assertions:

```js
expect(validator.isUUID(UNASSIGNED_DATASETS_GROUP_ID)).toBe(true);
expect(UNASSIGNED_DATASETS_GROUP_ID.startsWith('00000000')).toBe(false);
```

## Correcting a migration that has only ever run here

A migration on an unmerged branch that has run nowhere but the disposable development
database is not history worth preserving. When you find a defect in one — a bad sentinel,
a wrong default — edit that migration in place and `migrate reset`, rather than adding a
follow-up migration that corrects it. A fix-forward migration renaming an id that never
existed outside your laptop is noise in the permanent record.

Say so plainly in the commit message and in the plan document, because the change is
invisible in a diff of the later commit.

The line to stop at is deployment. Once a migration has run anywhere else, it is frozen
and the correction has to be a new migration.

## A failed migration blocks the next attempt, and editing it demands a reset

When a data migration fails part-way, Prisma records the attempt. Fixing the SQL and running
`migrate dev` again does not retry it: Prisma sees a migration whose checksum changed after it
was applied and asks to reset the whole database, which needs the user's consent and destroys
the development data.

`migrate resolve --rolled-back` is not enough either. It leaves the row in place, and
`migrate deploy` then refuses with P3009 because a failed migration is present.

The way through, on a development database, is to delete the row and deploy:

```sh
psql ... -c "DELETE FROM _prisma_migrations WHERE migration_name = '<name>';"
npx prisma migrate deploy
```

Postgres runs each migration in a transaction, so a migration that failed on any statement
wrote nothing and there is no partial state to undo. Iterate that way until the SQL is right.

## Writing rows by hand: the three columns that bite

A data migration or backfill that inserts into an existing table has to satisfy constraints
Prisma normally handles in the client.

**Client-side defaults are not database defaults.** `@default(uuid())` generates the value in
the Prisma client, so the column has no `DEFAULT` in Postgres and a plain `INSERT` fails on
the not-null primary key. Supply `(gen_random_uuid())::text` yourself. `@default(dbgenerated(...))`
is the one that does reach the database.

**Check what a NOT NULL provenance column actually points at.** `grant.granted_by` is NOT NULL
and its foreign key is to `user.subject_id`, not to `subject`. A group is a subject and passes
the eye test, and then violates the constraint. For a row the system issues rather than a
person, use the `svc_tasks` service account, which `prisma/seed_baseline.js` creates in
every environment.

**Make the insert re-runnable.** Guard it with `NOT EXISTS`, so a re-run adds nothing rather
than tripping a uniqueness or exclusion constraint. The `grant_no_overlap` exclusion
constraint turns a careless second run into an error rather than a duplicate.

## Uniqueness rules over a nullable column

The database is Postgres 18, so `NULLS NOT DISTINCT` on a unique index is available. It
arrived in Postgres 15; on an older server the error is a bare
`syntax error at or near "NULLS"`, which reads like a typo rather than a version problem.

Prisma models neither `NULLS NOT DISTINCT` nor a partial unique index, so either one lives in
the migration alone. The existing idiom here is a pair of partial unique indexes, and the
`restriction` table uses it:

```sql
CREATE UNIQUE INDEX "..._key"    ON t ("a", "b", "c") WHERE "c" IS NOT NULL;
CREATE UNIQUE INDEX "..._no_c_key" ON t ("a", "b")      WHERE "c" IS NULL;
```

Without the second one Postgres treats every NULL as distinct and the same row can be inserted
repeatedly.

Declare these in the migration only. Adding a plain `@@unique` to `schema.prisma` to stand in
for them produces permanent drift. Leave a
comment on the model saying where the real indexes are. `createMany({ skipDuplicates: true })`
still respects them, because it emits `ON CONFLICT DO NOTHING` with no target — so a duplicate
becomes a skipped row rather than an error.

## A backfill migration cannot see seeded lookup rows on a fresh database

The seed runs after migrations, so on a fresh database a migration that joins a lookup
table such as `grant_access_type` matches nothing. That is usually harmless, because the tables
it would backfill are empty too — but only if the seed then writes the same rows for what it
creates.

So a backfill of this shape needs writing in three places, not one: the service that creates
the row from now on, the migration for rows that predate the rule, and the seed for rows the
seed inserts directly. Leaving out the seed gives a freshly reset database that is quietly
inconsistent with every other environment.

## A nested relation create rejects a scalar foreign key

`prisma.dataset.create({ data: { resource: { create: {...} }, owner_group_id: '...' } })`
fails with `Argument 'owner_group' is missing`. Once one relation is written in nested form,
the whole create uses the relation input variant, and a sibling scalar FK is not accepted.
Connect the relation instead:

```js
owner_group: { connect: { id: UNASSIGNED_DATASETS_GROUP_ID } }
```

This bites in `prisma/seed.js`, where rows are built up as plain objects and the shape is
not obvious until it fails at the end of a reset.

## Views are the choke point for "currently in force"

When a table gains validity columns, do not add a `WHERE` clause to the twenty-odd queries
that read it. Create a view and point the readers at it:

```sql
CREATE OR REPLACE VIEW active_group_user AS
SELECT * FROM group_user
WHERE removed_at IS NULL
  AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP);
```

Raw SQL reads swap the table name for the view. Prisma-client reads take an explicit
`removed_at: null`. Writes keep using the base table. After the change, grep for the base
table name and confirm every remaining hit is a write or a deliberate history query.

`effective_user_groups` and `effective_user_oversight_groups` must be rebuilt on top of the
active view in the same migration, or expired memberships keep conferring access.
`CREATE OR REPLACE VIEW` works only while the column list is unchanged.

## The dev server crashes during a schema change

Between editing `schema.prisma` and finishing `npx prisma generate` there is a window where
`nodemon` reloads against a stale generated client. The API dies with something like
`Cannot register virtual attribute loader: <name> is a column or relation in the Prisma
model`, and nodemon then sits waiting for a file change that has already happened.

It is not a real error and it does not mean the rename failed. Finish `prisma generate`,
then `bin/devserver.sh restart api`. See the `dev-servers` skill.

To check the generated client actually has your change:

```
node -e "const {Prisma}=require('@prisma/client');
console.log(Prisma.dmmf.datamodel.models.find(m=>m.name==='user').fields.map(f=>f.name))"
```

## Resetting the dev database

Dev data is disposable and comes entirely from `api/prisma/seed_data`, so a reset is the
tidy way to fold a follow-up migration back into the original. Prisma blocks it for agents:

```
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<the user's exact consent text>" \
  npx prisma migrate reset --force --skip-generate
```

The variable must hold the exact words of the message in which the user consented, with no
newlines or quotes, and earlier messages do not count. Ask for the consent explicitly, in
its own question, before running this.

A reset re-seeds, which can unmask test bugs that a long-lived database was hiding — a
suite that passed only because the table happened to hold one kind of row. Treat new
failures after a reset as real until shown otherwise.

## Adding a NOT NULL column to a populated lookup table

`grant_access_type` gained `category`, `sort_order`, and `is_requestable`, all NOT NULL and
all supplied by the seed. The migration runs before the seed, so on a populated database
the rows already exist and a plain `ADD COLUMN ... NOT NULL` fails. Add each column with a
temporary default, then drop the default in a second `ALTER`:

```sql
ALTER TABLE "grant_access_type"
  ADD COLUMN "category" "GRANT_ACCESS_TYPE_CATEGORY" NOT NULL DEFAULT 'DATASET_ABOUT',
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "grant_access_type"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "sort_order" DROP DEFAULT;
```

The schema then declares no default, which matches the database, so there is no drift. The
placeholder values survive only until the seed's upsert overwrites them, so the seed's
`update` branch must write the new columns too, not only its `create` branch.

A Postgres enum sorts in declaration order, not alphabetically. `orderBy: { category: 'asc' }`
therefore follows the order the values are written in `schema.prisma`, which makes the enum
a legitimate place to encode display order.

## Deleting lookup rows the seed no longer lists

`seed_baseline.js` deletes access types missing from `GRANT_ACCESS_TYPES`. Grants, access
request items, and preset items reference them with RESTRICT foreign keys.

**Check the references before deleting, rather than catching the error.** Postgres reports
a RESTRICT violation as `23001`, not the `23503` that Prisma maps to `P2003`. Prisma surfaces
it as a `PrismaClientUnknownRequestError` with no `code`, so a `catch` testing for `P2003`
rethrows it and the seed dies with a stack trace instead of its own message. Count the
referencing rows first and `refuse` with the stale names.

A retired preset still counts. Presets are retired with `is_active: false`, never deleted, so
their items keep naming the old type, and only a database reset clears them.

## Keeping this current

When a session in this area hits something this page does not mention — a constraint Prisma
would not express, a migration that had to be split, a reader that was missed — amend this
file in the same change. Record dead ends explicitly, and verify a claim against the running
database before writing it down here.
