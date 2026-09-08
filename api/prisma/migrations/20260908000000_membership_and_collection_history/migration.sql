-- Membership and collection-content rows are closed rather than deleted, so that effective
-- access can be reconstructed for a past date.
--
-- @see docs/design/groups/decisions.md — 1. Membership and collection history are preserved

-- ============================================================================
-- group_user: surrogate primary key + validity columns
-- ============================================================================

-- The default is set at the database level, not only in the Prisma schema: membership
-- writes go through raw INSERT statements, which never see a client-side default.
ALTER TABLE "group_user" ADD COLUMN "id" TEXT;
UPDATE "group_user" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "group_user" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "group_user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "group_user" DROP CONSTRAINT "group_user_pkey";
ALTER TABLE "group_user" ADD CONSTRAINT "group_user_pkey" PRIMARY KEY ("id");

ALTER TABLE "group_user"
  ADD COLUMN "valid_until" TIMESTAMP(6),
  ADD COLUMN "removed_at"  TIMESTAMP(6),
  ADD COLUMN "removed_by"  TEXT;

ALTER TABLE "group_user"
  ADD CONSTRAINT "group_user_removed_by_fkey"
  FOREIGN KEY ("removed_by") REFERENCES "user"("subject_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one open membership per (group, user). Re-adding a removed member opens a new
-- row; the closed row stays, so the gap in membership remains visible.
CREATE UNIQUE INDEX "group_user_one_open_membership"
  ON "group_user" ("group_id", "user_id")
  WHERE "removed_at" IS NULL;

CREATE INDEX "group_user_group_id_user_id_idx" ON "group_user" ("group_id", "user_id");
CREATE INDEX "group_user_removed_at_idx" ON "group_user" ("removed_at");

-- ============================================================================
-- collection_dataset: surrogate primary key + removal columns
-- ============================================================================

ALTER TABLE "collection_dataset" ADD COLUMN "id" TEXT;
UPDATE "collection_dataset" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "collection_dataset" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "collection_dataset" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

ALTER TABLE "collection_dataset" DROP CONSTRAINT "collection_dataset_pkey";
ALTER TABLE "collection_dataset" ADD CONSTRAINT "collection_dataset_pkey" PRIMARY KEY ("id");

ALTER TABLE "collection_dataset"
  ADD COLUMN "removed_at" TIMESTAMP(6),
  ADD COLUMN "removed_by" TEXT;

ALTER TABLE "collection_dataset"
  ADD CONSTRAINT "collection_dataset_removed_by_fkey"
  FOREIGN KEY ("removed_by") REFERENCES "user"("subject_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "collection_dataset_one_open_membership"
  ON "collection_dataset" ("collection_id", "dataset_id")
  WHERE "removed_at" IS NULL;

CREATE INDEX "collection_dataset_collection_id_dataset_id_idx"
  ON "collection_dataset" ("collection_id", "dataset_id");
CREATE INDEX "collection_dataset_removed_at_idx" ON "collection_dataset" ("removed_at");

-- ============================================================================
-- Views: the single place that decides what "currently a member" means
--
-- Every read that asks "who is a member now?" or "what is in this collection now?" goes
-- through these views. A query that reads the base table sees closed rows too, which is
-- correct only for history questions.
-- ============================================================================

CREATE OR REPLACE VIEW active_group_user AS
SELECT *
FROM group_user gu
WHERE gu.removed_at IS NULL
  AND (gu.valid_until IS NULL OR gu.valid_until > CURRENT_TIMESTAMP);

CREATE OR REPLACE VIEW active_collection_dataset AS
SELECT *
FROM collection_dataset cd
WHERE cd.removed_at IS NULL;

-- Rebuild the effective-access views on top of active membership.
-- Column lists are unchanged, so CREATE OR REPLACE is sufficient.

CREATE OR REPLACE VIEW effective_user_groups AS
SELECT
  gu.user_id,
  gc.ancestor_id AS group_id
FROM active_group_user gu
JOIN group_closure gc ON gc.descendant_id = gu.group_id;

CREATE OR REPLACE VIEW effective_user_oversight_groups AS
SELECT
  gu.user_id,
  gc.descendant_id AS group_id
FROM active_group_user gu
JOIN group_closure gc ON gc.ancestor_id = gu.group_id
WHERE gu.role = 'ADMIN'
  AND gc.depth > 0;
