-- Group names are unique among siblings rather than system-wide.
--
-- @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
--
-- A system-wide unique name is an existence oracle: any caller learns whether a name is taken
-- anywhere, including in archived groups and groups they may not see, and any group denies a
-- name to every other group by taking it first. The same argument moved dataset names to the
-- owning group in 20260910010000. Nothing resolves a group by name: slug answers
-- /groups/slug/:slug, archive_key names the tape directory, and both stay system-wide unique.

-- ---------------------------------------------------------------------------
-- 1. group.parent_id
--
-- The parent, or NULL for a root. group_closure already holds this fact as its depth-1 row,
-- but a closure table cannot be the key of a unique index. This column is the authority and
-- the closure is derived from it; createGroup writes both in the same transaction.
-- ---------------------------------------------------------------------------
ALTER TABLE "group" ADD COLUMN "parent_id" TEXT;

UPDATE "group" g
SET "parent_id" = gc."ancestor_id"
FROM "group_closure" gc
WHERE gc."descendant_id" = g."id" AND gc."depth" = 1;

ALTER TABLE "group"
  ADD CONSTRAINT "group_parent_id_fkey" FOREIGN KEY ("parent_id")
  REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "group_parent_id_idx" ON "group"("parent_id");

-- ---------------------------------------------------------------------------
-- 2. The uniqueness rule moves from the system to the sibling set
--
-- NULLS NOT DISTINCT is what constrains root groups. Root groups have a NULL parent, and a
-- plain unique index treats every NULL as distinct, so two roots could both be named "CDMD".
-- The clause needs PostgreSQL 15 or newer.
-- ---------------------------------------------------------------------------
DROP INDEX "group_name_key";

CREATE UNIQUE INDEX "group_parent_id_name_key"
  ON "group"("parent_id", "name") NULLS NOT DISTINCT;
