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
   That SQL is usually wrong — see "Prisma reads a database default as drift" below. Delete
   the generated directory, fix the schema so it describes what the database actually has,
   and reset rather than layering a correction on top.
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

## Sentinel ids have to be real UUIDs

A seeded system row with a memorable id — a quarantine group, a system principal — is
tempting to write as `00000000-0000-0000-0000-000000000001`. Postgres stores it happily,
because the column is `text`. Route validation does not: `express-validator`'s `isUUID()`
checks the version and variant nibbles, so a zero-filled id fails `param('id').isUUID()`
and the row is listable but its detail page returns 400.

Set both nibbles. `00000000-0000-4000-8000-000000000001` reads as a sentinel and parses as
a version 4 UUID. `EVERYONE_GROUP_ID` predates this and is all zeros; it survives only
because nothing addresses it by route parameter.

The test worth writing is one line, next to the seeded row's other assertions:

```js
expect(validator.isUUID(UNASSIGNED_DATASETS_GROUP_ID)).toBe(true);
```

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
