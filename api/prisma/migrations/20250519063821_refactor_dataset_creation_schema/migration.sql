/*
  Warnings:

  - You are about to drop the column `src_instrument_id` on the `dataset` table. All the data in the column will be lost.
  - You are about to drop the column `create_method` on the `dataset_audit` table. All the data in the column will be lost.
  - You are about to drop the column `dataset_upload_log_id` on the `file_upload_log` table. All the data in the column will be lost.
  - You are about to drop the `dataset_upload_log` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "dataset" DROP CONSTRAINT "dataset_src_instrument_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_upload_log" DROP CONSTRAINT "dataset_upload_log_audit_log_id_fkey";

-- DropForeignKey
ALTER TABLE "file_upload_log" DROP CONSTRAINT "file_upload_log_dataset_upload_log_id_fkey";

-- DropIndex
DROP INDEX "dataset_audit_dataset_id_create_method_key";

-- AlterTable
ALTER TABLE "dataset" DROP COLUMN "src_instrument_id";

-- AlterTable
ALTER TABLE "dataset_audit" DROP COLUMN "create_method";

-- AlterTable
ALTER TABLE "file_upload_log" DROP COLUMN "dataset_upload_log_id",
ADD COLUMN     "upload_log_id" INTEGER;

-- DropTable
DROP TABLE "dataset_upload_log";

-- CreateTable
CREATE TABLE "dataset_create_log" (
    "id" SERIAL NOT NULL,
    "dataset_id" INTEGER NOT NULL,
    "src_instrument_id" INTEGER,
    "create_method" "DATASET_CREATE_METHOD" NOT NULL,
    "creator_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upload_log_id" INTEGER,
    "import_log_id" INTEGER,
    "scan_log_id" INTEGER,

    CONSTRAINT "dataset_create_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_log" (
    "id" SERIAL NOT NULL,
    "dataset_create_log_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_log" (
    "id" SERIAL NOT NULL,
    "dataset_create_log_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_log" (
    "id" SERIAL NOT NULL,
    "dataset_create_log_id" INTEGER NOT NULL,
    "status" "upload_status" NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_create_log_dataset_id_key" ON "dataset_create_log"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_create_log_upload_log_id_key" ON "dataset_create_log"("upload_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_create_log_import_log_id_key" ON "dataset_create_log"("import_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_create_log_scan_log_id_key" ON "dataset_create_log"("scan_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_log_dataset_create_log_id_key" ON "import_log"("dataset_create_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "scan_log_dataset_create_log_id_key" ON "scan_log"("dataset_create_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_log_dataset_create_log_id_key" ON "upload_log"("dataset_create_log_id");

-- AddForeignKey
ALTER TABLE "dataset_create_log" ADD CONSTRAINT "dataset_create_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_create_log" ADD CONSTRAINT "dataset_create_log_src_instrument_id_fkey" FOREIGN KEY ("src_instrument_id") REFERENCES "instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_create_log" ADD CONSTRAINT "dataset_create_log_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_log" ADD CONSTRAINT "import_log_dataset_create_log_id_fkey" FOREIGN KEY ("dataset_create_log_id") REFERENCES "dataset_create_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_log" ADD CONSTRAINT "scan_log_dataset_create_log_id_fkey" FOREIGN KEY ("dataset_create_log_id") REFERENCES "dataset_create_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_dataset_create_log_id_fkey" FOREIGN KEY ("dataset_create_log_id") REFERENCES "dataset_create_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_upload_log_id_fkey" FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: Enforce dataset creation method consistency

--
-- This constraint ensures that the `create_method` field in the `DatasetCreateLog` table
-- stays consistent with the corresponding foreign key to one of the method-specific log tables.
--
-- The `DatasetCreateLog` table supports three creation methods:
--   - UPLOAD → must have a non-null `upload_log_id`
--   - IMPORT → must have a non-null `import_log_id`
--   - SCAN   → must have a non-null `scan_log_id`
--
-- To prevent ambiguous, partial, or corrupted creation logs, we enforce the following:
--   1. Exactly one of the *_log_id fields must be set, depending on the value of `create_method`
--   2. The other two log fields must be NULL
--
-- Without this constraint, invalid combinations could appear such as:
--   - `create_method = 'UPLOAD'` but no `upload_log_id` set
--   - Multiple log IDs set simultaneously (e.g., both `upload_log_id` and `import_log_id`)
--   - No log ID set at all, despite a creation method being specified
--
-- This check is essential for:
--   - Data consistency
--   - Simplifying validation in the application layer
ALTER TABLE "dataset_create_log"
    ADD CONSTRAINT dataset_create_method_consistency_check
        CHECK (
            (
                create_method = 'UPLOAD'
                    AND upload_log_id IS NOT NULL
                    AND import_log_id IS NULL
                    AND scan_log_id IS NULL
                )
                OR
            (
                create_method = 'IMPORT'
                    AND import_log_id IS NOT NULL
                    AND upload_log_id IS NULL
                    AND scan_log_id IS NULL
                )
                OR
            (
                create_method = 'SCAN'
                    AND scan_log_id IS NOT NULL
                    AND upload_log_id IS NULL
                    AND import_log_id IS NULL
                )
            );
