-- =============================================================================
-- Upload Feature Rewrite — Database Migration
-- =============================================================================
--
-- This migration covers all schema and data changes introduced by the upload
-- rewrite branch.  It is split into two independent parts that can be read and
-- reasoned about separately; there is no ordering dependency between them.
--
--   Part 1 — Move create_method from dataset_audit to dataset
--   Part 2 — Rebuild the upload_status enum
--   Part 3 — Restructure dataset_upload_log (audit_log_id → dataset_id, new columns)
--
-- Both parts run inside a single transaction so the migration is atomic: if
-- either part fails the entire migration rolls back with no partial state left
-- in the database.
-- =============================================================================


-- /////////////////////////////////////////////////////////////////////////////
-- PART 1: Move create_method from dataset_audit → dataset
-- /////////////////////////////////////////////////////////////////////////////
--
-- Background
-- ----------
-- Migration 20250428213406 added a create_method column to dataset_audit (with
-- a unique constraint on (dataset_id, create_method)) and the code at the time
-- wrote the value there.  This branch moves create_method directly onto the
-- dataset row, which is the more natural home for it — it describes how a
-- dataset was created, not how a particular audit event occurred.
--
-- Steps
-- -----
--   1. Add the column to dataset  (DATASET_CREATE_METHOD enum already exists).
--   2. Backfill from dataset_audit.
--   3. Drop the column (and its unique index) from dataset_audit.
-- /////////////////////////////////////////////////////////////////////////////

-- Step 1: Add create_method to dataset.
-- The DATASET_CREATE_METHOD enum already exists (created by 20250428213406).
ALTER TABLE "dataset"
    ADD COLUMN "create_method" "DATASET_CREATE_METHOD";

-- Step 2: Backfill dataset.create_method from dataset_audit.create_method.
--
-- Edge cases handled:
--   - dataset_audit rows with NULL create_method are excluded (most rows —
--     action='delete', action='read', etc. — never had a value here).
--   - dataset_audit rows with NULL dataset_id are excluded (orphaned rows that
--     cannot be matched to a dataset).
--   - If a dataset somehow has multiple dataset_audit rows with *different*
--     non-null create_method values (theoretically possible because the unique
--     constraint only prevents duplicate values for the same value, not two
--     different ones for the same dataset), the row with the earliest timestamp
--     is used as the canonical create_method.  When timestamps are equal, the
--     lower id wins (deterministic tiebreak).
--   - WHERE d.create_method IS NULL makes this a no-op for rows that already
--     have a value, keeping the statement safe to re-run.
UPDATE "dataset" d
SET    "create_method" = source.create_method
FROM (
    SELECT DISTINCT ON ("dataset_id")
           "dataset_id",
           "create_method"
    FROM   "dataset_audit"
    WHERE  "create_method" IS NOT NULL
      AND  "dataset_id"    IS NOT NULL
    ORDER BY
           "dataset_id",
           "timestamp" ASC,  -- earliest creation record is canonical
           "id"        ASC   -- deterministic tiebreak on identical timestamps
) source
WHERE  d."id"            = source."dataset_id"
  AND  d."create_method" IS NULL;

-- Step 3: Remove create_method from dataset_audit now that the data has been
-- moved.  Drop the unique index first (required before dropping the column).
DROP INDEX IF EXISTS "dataset_audit_dataset_id_create_method_key";

ALTER TABLE "dataset_audit"
    DROP COLUMN "create_method";


-- /////////////////////////////////////////////////////////////////////////////
-- PART 2: Rebuild the upload_status enum
-- /////////////////////////////////////////////////////////////////////////////
--
-- Background
-- ----------
-- The upload rewrite introduces four new upload statuses and retires one:
--
--   Added:
--     VERIFYING          — integrity verification Celery task is running
--     VERIFIED           — integrity verified; ready to start Integrated workflow
--     VERIFICATION_FAILED — integrity check failed; dataset not registered
--     PERMANENTLY_FAILED — failed after max retries; no further automatic action
--
--   Removed:
--     FAILED             — defined in migration 20241114142916 but never used by
--                          any code path in this branch; every failure scenario
--                          uses one of the four more-specific values above.
--
-- Technique
-- ---------
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE, so the only safe way
-- to remove an enum value is to recreate the type from scratch.  The pattern
-- used here (TEXT → DROP → CREATE → enum) is safe because:
--   - No row in dataset_upload_log has status = 'FAILED' (nothing ever sets it).
--   - The USING clause in Step 4 raises "invalid input value for enum" at
--     runtime if any such row does exist, acting as an automatic safety check
--     and rolling the whole migration back cleanly.
-- /////////////////////////////////////////////////////////////////////////////

-- Step 1: Temporarily widen all columns that use this type to plain text so we
-- can drop the type.  Both dataset_upload_log and file_upload_log reference it.
ALTER TABLE "dataset_upload_log"
    ALTER COLUMN "status" TYPE TEXT;

ALTER TABLE "file_upload_log"
    ALTER COLUMN "status" TYPE TEXT;

-- Step 2: Drop the old enum.
DROP TYPE "upload_status";

-- Step 3: Recreate with the correct set of values.
CREATE TYPE "upload_status" AS ENUM (
    'UPLOADING',            -- TUS upload session is in progress
    'UPLOAD_FAILED',        -- TUS upload did not complete
    'UPLOADED',             -- All chunks received; ready for integrity verification
    'VERIFYING',            -- Integrity verification in progress (async Celery task)
    'VERIFIED',             -- Integrity verified; ready to trigger Integrated workflow
    'VERIFICATION_FAILED',  -- Integrity check failed; dataset not registered
    'PROCESSING',           -- Integrated workflow is running
    'PROCESSING_FAILED',    -- Workflow failed; eligible for automatic retry
    'COMPLETE',             -- Workflow finished successfully
    'PERMANENTLY_FAILED'    -- Failed after max retry attempts; no further retries
);

-- Step 4: Restore the column types.
-- The USING clause casts the stored text back to the enum.  If any row
-- contains 'FAILED' this will raise "invalid input value for enum" and the
-- migration will be rolled back, preventing silent data loss.
ALTER TABLE "dataset_upload_log"
    ALTER COLUMN "status" TYPE "upload_status"
    USING "status"::"upload_status";

-- file_upload_log.status uses the same enum; restore it too.
ALTER TABLE "file_upload_log"
    ALTER COLUMN "status" TYPE "upload_status"
    USING "status"::"upload_status";


-- /////////////////////////////////////////////////////////////////////////////
-- PART 3: Restructure dataset_upload_log — replace audit_log_id with dataset_id
-- /////////////////////////////////////////////////////////////////////////////
--
-- Background
-- ----------
-- Migration 20250428213406 redesigned dataset_upload_log to link to a dataset
-- indirectly through dataset_audit (via audit_log_id).  This branch reverts
-- that indirection: the upload log now holds a direct dataset_id FK, which is
-- simpler, avoids a join, and removes the dependency on an audit row existing
-- before an upload log can be created.
--
-- New columns also added on this branch:
--   process_id   — TUS upload ID (or other upload-protocol identifier)
--   retry_count  — number of times the integrated workflow has been retried
--   metadata     — JSON bag for checksum result, failure reason, worker PID, etc.
--
-- Steps
-- -----
--   1. Add the new columns (dataset_id nullable so the backfill in step 2 can run).
--   2. Backfill dataset_id from dataset_audit via the existing audit_log_id FK
--      (this is the last time audit_log_id is used).
--   3. Make dataset_id NOT NULL — will raise if any row could not be backfilled,
--      preventing silent partial migration.
--   4. Add the FK constraint from dataset_upload_log.dataset_id → dataset.id.
--   5. Drop the old audit_log_id FK constraint, its unique index, and the column.
--   6. Add a UNIQUE index on dataset_id, enforcing the 1-to-1 relationship between
--      a dataset and its upload log.  Queries use findFirst and assume at most one
--      record per dataset; without this constraint a second upload log row for the
--      same dataset would be silently ignored.
-- /////////////////////////////////////////////////////////////////////////////

-- Step 1: Add new columns.  dataset_id is nullable until the backfill in step 2.
ALTER TABLE "dataset_upload_log"
    ADD COLUMN "dataset_id"  INTEGER,
    ADD COLUMN "process_id"  TEXT,
    ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "metadata"    JSONB;

-- Step 2: Backfill dataset_id from dataset_audit using the existing audit_log_id FK.
-- Every dataset_upload_log row was created alongside a dataset_audit row whose
-- dataset_id points at the owning dataset — that relationship is used here.
UPDATE "dataset_upload_log" dul
SET    "dataset_id" = da."dataset_id"
FROM   "dataset_audit" da
WHERE  da."id" = dul."audit_log_id";

-- Step 3: Enforce NOT NULL now that all rows have been backfilled.
-- This will raise if any audit_log_id had no matching dataset_audit row, which
-- would indicate corrupted data and should be fixed before re-running.
ALTER TABLE "dataset_upload_log"
    ALTER COLUMN "dataset_id" SET NOT NULL;

-- Step 4: Add the FK constraint.
ALTER TABLE "dataset_upload_log"
    ADD CONSTRAINT "dataset_upload_log_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Drop the old audit_log_id FK, its unique index, and the column.
ALTER TABLE "dataset_upload_log"
    DROP CONSTRAINT "dataset_upload_log_audit_log_id_fkey";

DROP INDEX "dataset_upload_log_audit_log_id_key";

ALTER TABLE "dataset_upload_log"
    DROP COLUMN "audit_log_id";

-- Step 6: Create a UNIQUE index on dataset_id.
-- This enforces the 1-to-1 invariant that every dataset has at most one upload
-- log.  Without it, a second row could be inserted silently and findFirst queries
-- throughout the API would return whichever row Postgres happens to scan first.
CREATE UNIQUE INDEX "dataset_upload_log_dataset_id_key"
    ON "dataset_upload_log"("dataset_id");
