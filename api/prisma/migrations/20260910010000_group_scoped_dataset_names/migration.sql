-- Dataset names are unique within an owning group, and storage paths carry the group.
--
-- @see docs/design/groups/dataset-storage.md
--
-- A globally unique dataset name is an existence oracle: any user can ask whether a name is
-- taken and learn that another group holds it, and a group can deny a name to every other
-- group by taking it first. The name is unique because archives on tape are named after the
-- dataset, so an administrator can find data by name when the database is gone. That
-- readability is worth keeping, so the archive path gains a group directory and the
-- uniqueness rule gains the group alongside it.

-- ---------------------------------------------------------------------------
-- 1. group.archive_key
--
-- The directory a group's archives live under. Derived from the slug once, then frozen:
-- slug is regenerated on every rename, and an archive layout built on it would fragment the
-- first time somebody renames a group.
-- ---------------------------------------------------------------------------
ALTER TABLE "group" ADD COLUMN "archive_key" TEXT;

UPDATE "group" SET "archive_key" = "slug" WHERE "archive_key" IS NULL;

ALTER TABLE "group" ALTER COLUMN "archive_key" SET NOT NULL;

CREATE UNIQUE INDEX "group_archive_key_key" ON "group"("archive_key");

-- ---------------------------------------------------------------------------
-- 2. dataset.owner_group_id becomes NOT NULL with a database default
--
-- 20260908010000 made this column NOT NULL and 20260909010000 reversed it, because the
-- legacy creation routes send no owning group and would have started failing. The default
-- is what makes the constraint safe this time: a caller that names no group lands in the
-- seeded 'Unassigned Datasets' group rather than being rejected, so legacy behaviour is
-- unchanged. Every legacy row shares one group, so those rows stay mutually unique on name
-- and type exactly as they were under the old key.
--
-- datasets_v2.buildDatasetCreateQuery still throws without an explicit group, so v2 never
-- reaches the default by accident.
--
-- The group itself, its subject row, its closure self-edge, and the rule preventing its
-- deletion were all created by 20260908010000 and are still in place.
-- ---------------------------------------------------------------------------
UPDATE "dataset"
SET "owner_group_id" = 'ffffffff-0000-4000-8000-000000000001'
WHERE "owner_group_id" IS NULL;

ALTER TABLE "dataset"
  ALTER COLUMN "owner_group_id" SET DEFAULT 'ffffffff-0000-4000-8000-000000000001';

ALTER TABLE "dataset" ALTER COLUMN "owner_group_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The uniqueness rule gains the owning group
--
-- Two groups may now hold a dataset of the same name and type, and neither can discover
-- that the other does.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "dataset_name_type_is_deleted_key";

CREATE UNIQUE INDEX "dataset_owner_group_id_name_type_is_deleted_key"
  ON "dataset"("owner_group_id", "name", "type", "is_deleted");

-- ---------------------------------------------------------------------------
-- 4. dataset.archive_group_key
--
-- Which group owned the dataset when its bundle was written. archive_path is written once
-- and read forever after, so this column is the record of what that path means. The current
-- owner_group_id stops answering that question as soon as a transfer is possible.
-- ---------------------------------------------------------------------------
ALTER TABLE "dataset" ADD COLUMN "archive_group_key" TEXT;

-- Rows archived before this migration live under the flat, pre-group layout. Their
-- archive_path still resolves, because it is stored rather than recomputed; leaving the key
-- NULL says plainly that no group directory is part of that path.
