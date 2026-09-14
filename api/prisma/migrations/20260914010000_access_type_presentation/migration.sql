-- The selector heading, the position under it, and whether each access type can be requested.
-- The seed writes all three columns on every run. The defaults below exist only so the columns
-- can be added to a table that already has rows, and they are dropped straight away.
-- @see docs/design/groups/ui-information-architecture.md — Access types in forms

CREATE TYPE "GRANT_ACCESS_TYPE_CATEGORY" AS ENUM ('COLLECTION', 'DATASET_ABOUT', 'DATASET_FILES', 'DATASET_DATA');

ALTER TABLE "grant_access_type"
  ADD COLUMN "category" "GRANT_ACCESS_TYPE_CATEGORY" NOT NULL DEFAULT 'DATASET_ABOUT',
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "is_requestable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "grant_access_type"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "sort_order" DROP DEFAULT,
  ALTER COLUMN "is_requestable" DROP DEFAULT;
