---
name: prisma-schema-changes
description: Operational technique for changing the Prisma schema in this repository - writing a migration by hand, the defaults and constraints Prisma cannot express, how a validity column silently breaks relation reads, why a seeded sentinel id has to parse as a real UUID, and how to reset the dev database. Use when editing api/prisma/schema.prisma, adding a migration under api/prisma/migrations, changing api/prisma/seed.js, or touching anything that reads group_user, collection_dataset, or the effective-access views.
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

## Lookup rows come from the seed, not from a migration

`grant_access_type`, `grant_preset`, and the roles are populated by `prisma/seed.js`, which
runs **after** every migration. A migration that inserts into a table joined against one of
those writes nothing, silently, because the table it joins to is still empty at that point.

The symptom is a migration that applies without error and leaves the table empty. Check the
row count after a reset rather than assuming the `INSERT` worked.

Put new lookup data in `constants.js` next to `GRANT_ACCESS_TYPES`, seed it in `seed.js`
right after the rows it references, and let the migration create only the table. A test
asserting the seeded rows match the constant catches the two drifting apart.

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
person, use the `svc_tasks` service account, which both `prisma/seed.js` and
`src/scripts/init_prod_users.js` create.

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

`prisma/seed.js` runs after migrations, so on a fresh database a migration that joins a lookup
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

## Keeping this current

When a session in this area hits something this page does not mention — a constraint Prisma
would not express, a migration that had to be split, a reader that was missed — amend this
file in the same change. Record dead ends explicitly, and verify a claim against the running
database before writing it down here.
