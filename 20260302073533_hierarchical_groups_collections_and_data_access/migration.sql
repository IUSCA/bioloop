/*
  Warnings:

  - A unique constraint covering the columns `[resource_id]` on the table `dataset` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[subject_id]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "RESOURCE_TYPE" AS ENUM ('DATASET', 'COLLECTION');

-- CreateEnum
CREATE TYPE "SUBJECT_TYPE" AS ENUM ('USER', 'GROUP');

-- CreateEnum
CREATE TYPE "GROUP_MEMBER_ROLE" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "GRANT_RESOURCE_TYPE" AS ENUM ('DATASET', 'COLLECTION');

-- CreateEnum
CREATE TYPE "GRANT_CREATION_TYPE" AS ENUM ('ACCESS_REQUEST', 'MANUAL', 'SYSTEM_BOOTSTRAP');

-- CreateEnum
CREATE TYPE "ACCESS_REQUEST_TYPE" AS ENUM ('NEW', 'RENEWAL');

-- CreateEnum
CREATE TYPE "ACCESS_REQUEST_STATUS" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ACCESS_REQUEST_ITEM_DECISION" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PRINCIPAL_TYPE" AS ENUM ('USER', 'GROUP');

-- CreateEnum
CREATE TYPE "AUTH_RESOURCE_TYPE" AS ENUM ('DATASET', 'COLLECTION');

-- CreateEnum
CREATE TYPE "AUTH_TRANSFER_STATUS" AS ENUM ('PENDING', 'SOURCE_APPROVED', 'TARGET_APPROVED', 'APPROVED', 'EXECUTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "owner_group_id" TEXT,
ADD COLUMN     "resource_id" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "subject_id" TEXT;

-- CreateTable
CREATE TABLE "resource" (
    "id" TEXT NOT NULL,
    "type" "RESOURCE_TYPE" NOT NULL,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject" (
    "id" TEXT NOT NULL,
    "type" "SUBJECT_TYPE" NOT NULL,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "allow_user_contributions" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_closure" (
    "ancestor_id" TEXT NOT NULL,
    "descendant_id" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "group_closure_pkey" PRIMARY KEY ("ancestor_id","descendant_id")
);

-- CreateTable
CREATE TABLE "group_user" (
    "group_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "GROUP_MEMBER_ROLE" NOT NULL DEFAULT 'MEMBER',
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" INTEGER,

    CONSTRAINT "group_user_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "user_dataset_contribution" (
    "id" SERIAL NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "dataset_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_dataset_contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "owner_group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_dataset" (
    "collection_id" TEXT NOT NULL,
    "dataset_id" INTEGER NOT NULL,
    "added_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" INTEGER,

    CONSTRAINT "collection_dataset_pkey" PRIMARY KEY ("collection_id","dataset_id")
);

-- CreateTable
CREATE TABLE "grant" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "access_type_id" INTEGER NOT NULL,
    "valid_from" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(6),
    "granted_by" INTEGER NOT NULL,
    "justification" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(6),
    "revoked_by" INTEGER,
    "creation_type" "GRANT_CREATION_TYPE" NOT NULL,

    CONSTRAINT "grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_access_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resource_type" "GRANT_RESOURCE_TYPE" NOT NULL,

    CONSTRAINT "grant_access_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_request" (
    "id" TEXT NOT NULL,
    "type" "ACCESS_REQUEST_TYPE" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "purpose" TEXT,
    "previous_grant_ids" TEXT[],
    "status" "ACCESS_REQUEST_STATUS" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(6),
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(6),
    "closed_at" TIMESTAMP(6),

    CONSTRAINT "access_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_request_item" (
    "id" TEXT NOT NULL,
    "access_request_id" TEXT NOT NULL,
    "access_type_id" INTEGER NOT NULL,
    "requested_until" TIMESTAMP(3),
    "decision" "ACCESS_REQUEST_ITEM_DECISION" NOT NULL DEFAULT 'PENDING',
    "created_grant_id" TEXT,

    CONSTRAINT "access_request_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_audit" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_type" TEXT NOT NULL,
    "actor_id" INTEGER,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "action" TEXT,
    "metadata" JSONB,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "decision" BOOLEAN,
    "reason" TEXT,

    CONSTRAINT "authorization_audit_pkey" PRIMARY KEY ("id","timestamp")
) PARTITION BY RANGE (timestamp);

-- CreateTable
CREATE TABLE "authority_transfer" (
    "id" TEXT NOT NULL,
    "resource_type" "AUTH_RESOURCE_TYPE" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "source_principal_type" "PRINCIPAL_TYPE" NOT NULL,
    "source_principal_id" TEXT NOT NULL,
    "target_principal_type" "PRINCIPAL_TYPE" NOT NULL,
    "target_principal_id" TEXT NOT NULL,
    "proposed_by" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "AUTH_TRANSFER_STATUS" NOT NULL DEFAULT 'PENDING',
    "source_approved_at" TIMESTAMP(3),
    "source_approved_by" INTEGER,
    "target_approved_at" TIMESTAMP(3),
    "target_approved_by" INTEGER,
    "executed_at" TIMESTAMP(3),
    "executed_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authority_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_name_key" ON "group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "group_slug_key" ON "group"("slug");

-- CreateIndex
CREATE INDEX "group_closure_descendant_id_depth_idx" ON "group_closure"("descendant_id", "depth");

-- CreateIndex
CREATE INDEX "group_closure_ancestor_id_depth_idx" ON "group_closure"("ancestor_id", "depth");

-- CreateIndex
CREATE INDEX "group_user_user_id_idx" ON "group_user"("user_id");

-- CreateIndex
CREATE INDEX "user_dataset_contribution_group_id_idx" ON "user_dataset_contribution"("group_id");

-- CreateIndex
CREATE INDEX "user_dataset_contribution_user_id_idx" ON "user_dataset_contribution"("user_id");

-- CreateIndex
CREATE INDEX "user_dataset_contribution_dataset_id_idx" ON "user_dataset_contribution"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_dataset_contribution_group_id_user_id_dataset_id_key" ON "user_dataset_contribution"("group_id", "user_id", "dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_slug_key" ON "collection"("slug");

-- CreateIndex
CREATE INDEX "collection_owner_group_id_idx" ON "collection"("owner_group_id");

-- CreateIndex
CREATE INDEX "collection_is_archived_idx" ON "collection"("is_archived");

-- CreateIndex
CREATE INDEX "collection_dataset_dataset_id_idx" ON "collection_dataset"("dataset_id");

-- CreateIndex
CREATE INDEX "grant_subject_id_idx" ON "grant"("subject_id");

-- CreateIndex
CREATE INDEX "grant_resource_id_idx" ON "grant"("resource_id");

-- CreateIndex
CREATE INDEX "grant_valid_from_valid_until_idx" ON "grant"("valid_from", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "grant_access_type_name_resource_type_key" ON "grant_access_type"("name", "resource_type");

-- CreateIndex
CREATE INDEX "access_request_requester_id_status_idx" ON "access_request"("requester_id", "status");

-- CreateIndex
CREATE INDEX "access_request_resource_id_status_idx" ON "access_request"("resource_id", "status");

-- CreateIndex
CREATE INDEX "access_request_status_submitted_at_idx" ON "access_request"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "access_request_item_access_request_id_access_type_id_key" ON "access_request_item"("access_request_id", "access_type_id");

-- CreateIndex
CREATE INDEX "authorization_audit_event_type_timestamp_idx" ON "authorization_audit"("event_type", "timestamp");

-- CreateIndex
CREATE INDEX "authorization_audit_actor_id_idx" ON "authorization_audit"("actor_id");

-- CreateIndex
CREATE INDEX "authorization_audit_target_type_target_id_idx" ON "authorization_audit"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_resource_id_key" ON "dataset"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_subject_id_key" ON "user"("subject_id");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_owner_group_id_fkey" FOREIGN KEY ("owner_group_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_id_fkey" FOREIGN KEY ("id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_closure" ADD CONSTRAINT "group_closure_ancestor_id_fkey" FOREIGN KEY ("ancestor_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_closure" ADD CONSTRAINT "group_closure_descendant_id_fkey" FOREIGN KEY ("descendant_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_user" ADD CONSTRAINT "group_user_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_user" ADD CONSTRAINT "group_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_user" ADD CONSTRAINT "group_user_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dataset_contribution" ADD CONSTRAINT "user_dataset_contribution_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dataset_contribution" ADD CONSTRAINT "user_dataset_contribution_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dataset_contribution" ADD CONSTRAINT "user_dataset_contribution_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection" ADD CONSTRAINT "collection_owner_group_id_fkey" FOREIGN KEY ("owner_group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection" ADD CONSTRAINT "collection_id_fkey" FOREIGN KEY ("id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_dataset" ADD CONSTRAINT "collection_dataset_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_dataset" ADD CONSTRAINT "collection_dataset_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_dataset" ADD CONSTRAINT "collection_dataset_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_access_type_id_fkey" FOREIGN KEY ("access_type_id") REFERENCES "grant_access_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_item" ADD CONSTRAINT "access_request_item_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "access_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_item" ADD CONSTRAINT "access_request_item_access_type_id_fkey" FOREIGN KEY ("access_type_id") REFERENCES "grant_access_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_item" ADD CONSTRAINT "access_request_item_created_grant_id_fkey" FOREIGN KEY ("created_grant_id") REFERENCES "grant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_audit" ADD CONSTRAINT "authorization_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- CUSTOM SQL: Backfills, constraints, views, and exclusion constraints
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. authorization_audit: create monthly partitions for the next 10 years
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    start_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
    end_year INT := start_year + 9;
    year INT;
    month INT;
    next_month INT;
    next_year INT;
BEGIN
    FOR year IN start_year..end_year LOOP
        FOR month IN 1..12 LOOP
            next_month := month + 1;
            next_year := year;
            IF next_month > 12 THEN
                next_month := 1;
                next_year := year + 1;
            END IF;

            EXECUTE format('
                CREATE TABLE IF NOT EXISTS authorization_audit_%s_%s PARTITION OF authorization_audit
                FOR VALUES FROM (''%s-%s-01 00:00:00'') TO (''%s-%s-01 00:00:00'');
            ', year, LPAD(month::TEXT, 2, '0'), year, LPAD(month::TEXT, 2, '0'), next_year, LPAD(next_month::TEXT, 2, '0'));
        END LOOP;
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS authorization_audit_default PARTITION OF authorization_audit DEFAULT;

-- ---------------------------------------------------------------------------
-- 2. Backfill resource rows for all existing datasets
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _dataset_resource_map AS
SELECT "id" AS dataset_id, gen_random_uuid() AS resource_uuid
FROM "dataset";

INSERT INTO "resource" ("id", "type")
SELECT resource_uuid, 'DATASET'
FROM _dataset_resource_map;

UPDATE "dataset" d
SET "resource_id" = m.resource_uuid
FROM _dataset_resource_map m
WHERE d."id" = m.dataset_id;

DROP TABLE _dataset_resource_map;

-- Enforce NOT NULL now that all rows are populated
ALTER TABLE "dataset" ALTER COLUMN "resource_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Backfill subject rows for all existing users
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _user_subject_map AS
SELECT "id" AS user_id, gen_random_uuid() AS subject_uuid
FROM "user";

INSERT INTO "subject" ("id", "type")
SELECT subject_uuid, 'USER'
FROM _user_subject_map;

UPDATE "user" u
SET "subject_id" = m.subject_uuid
FROM _user_subject_map m
WHERE u."id" = m.user_id;

DROP TABLE _user_subject_map;

-- Enforce NOT NULL now that all rows are populated
ALTER TABLE "user" ALTER COLUMN "subject_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Create "Everyone" system group (subject row first, then group row)
-- ---------------------------------------------------------------------------
INSERT INTO "subject" ("id", "type")
VALUES ('00000000-0000-0000-0000-000000000000', 'GROUP');

INSERT INTO "group" ("id", "name", "slug", "description", "allow_user_contributions")
VALUES ('00000000-0000-0000-0000-000000000000', 'Everyone', 'everyone',
        'System principal representing all authenticated users. Cannot be deleted or modified.', false);

-- Prevent deletion of "Everyone" group
CREATE OR REPLACE RULE prevent_everyone_delete AS
  ON DELETE TO "group"
  WHERE OLD.id = '00000000-0000-0000-0000-000000000000'
  DO INSTEAD NOTHING;

-- Prevent members from being added to "Everyone" group
ALTER TABLE "group_user"
  ADD CONSTRAINT no_everyone_members
  CHECK (group_id != '00000000-0000-0000-0000-000000000000');

-- Prevent hierarchy relationships involving "Everyone" group
ALTER TABLE "group_closure"
  ADD CONSTRAINT no_everyone_hierarchy
  CHECK (
    ancestor_id   != '00000000-0000-0000-0000-000000000000'
    AND descendant_id != '00000000-0000-0000-0000-000000000000'
  );

-- ---------------------------------------------------------------------------
-- 5. Views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW effective_user_groups AS
SELECT
  gu.user_id,
  gc.ancestor_id AS group_id
FROM group_user gu
JOIN group_closure gc ON gc.descendant_id = gu.group_id;
-- self-rows in closure table (depth=0) cover direct membership too
-- Usage: SELECT DISTINCT group_id FROM effective_user_groups WHERE user_id = $1;

CREATE OR REPLACE VIEW effective_user_oversight_groups AS
SELECT
  gu.user_id,
  gc.descendant_id AS group_id
FROM group_user gu
JOIN group_closure gc ON gc.ancestor_id = gu.group_id
WHERE gu.role = 'ADMIN'
  AND gc.depth > 0;
-- Usage: SELECT DISTINCT group_id FROM effective_user_oversight_groups WHERE user_id = $1;

-- valid_from is inclusive, valid_until is exclusive
CREATE OR REPLACE VIEW valid_grants AS
SELECT *
FROM "grant" g
WHERE g.valid_from <= CURRENT_TIMESTAMP
  AND (g.valid_until IS NULL OR g.valid_until > CURRENT_TIMESTAMP)
  AND g.revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Non-overlapping grant exclusion constraint
-- For the same (subject_id, resource_id, access_type_id) tuple, there must
-- never exist two non-revoked grants whose validity intervals overlap.
-- Validity period: left inclusive [, right exclusive )
-- e.g. [10:00, 11:00) and [11:00, 12:00) do NOT overlap.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "grant"
  ADD COLUMN "valid_period" tsrange
  GENERATED ALWAYS AS (tsrange(valid_from, valid_until, '[)')) STORED;

ALTER TABLE "grant"
  ADD CONSTRAINT grant_no_overlap
  EXCLUDE USING gist (
    subject_id     WITH =,
    resource_id    WITH =,
    access_type_id WITH =,
    valid_period   WITH &&
  )
  WHERE (revoked_at IS NULL);
