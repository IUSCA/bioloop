/*
  Warnings:

  - A unique constraint covering the columns `[name,type,is_deleted,is_duplicate,version]` on the table `dataset` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('UPLOADING', 'UPLOAD_FAILED', 'UPLOADED', 'PROCESSING', 'PROCESSING_FAILED', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "DATASET_ACTION_ITEM_TYPE" AS ENUM ('DUPLICATE_DATASET_INGESTION');

-- CreateEnum
CREATE TYPE "DATASET_ACTION_ITEM_STATUS" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NOTIFICATION_STATUS" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NOTIFICATION_TYPE" AS ENUM ('INCOMING_DUPLICATE_DATASET');

-- CreateEnum
CREATE TYPE "DATASET_INGESTION_CHECK_TYPE" AS ENUM ('FILE_COUNT', 'CHECKSUMS_MATCH', 'FILES_MISSING_FROM_DUPLICATE', 'FILES_MISSING_FROM_ORIGINAL');

-- DropIndex
DROP INDEX "dataset_name_type_is_deleted_key";

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "file_type_id" INTEGER,
ADD COLUMN     "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "dataset_duplication" (
    "duplicate_dataset_id" INTEGER NOT NULL,
    "original_dataset_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_duplication_pkey" PRIMARY KEY ("duplicate_dataset_id")
);

-- CreateTable
CREATE TABLE "dataset_file_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,

    CONSTRAINT "dataset_file_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_log" (
    "id" SERIAL NOT NULL,
    "status" "upload_status" NOT NULL,
    "dataset_id" INTEGER,
    "last_updated" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_upload_log" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "md5" TEXT NOT NULL,
    "num_chunks" INTEGER NOT NULL,
    "status" "upload_status" NOT NULL,
    "chunks_path" TEXT NOT NULL,
    "destination_path" TEXT NOT NULL,
    "upload_log_id" INTEGER,

    CONSTRAINT "file_upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "NOTIFICATION_TYPE" NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "NOTIFICATION_STATUS" NOT NULL DEFAULT 'CREATED',
    "acknowledged_by_id" INTEGER,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_action_item" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "text" TEXT,
    "redirect_url" TEXT,
    "type" "DATASET_ACTION_ITEM_TYPE" NOT NULL,
    "status" "DATASET_ACTION_ITEM_STATUS" NOT NULL DEFAULT 'CREATED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notification_id" INTEGER,
    "dataset_id" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "dataset_action_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_ingestion_check" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "DATASET_INGESTION_CHECK_TYPE" NOT NULL,
    "label" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "report" JSONB,
    "action_item_id" INTEGER,

    CONSTRAINT "dataset_ingestion_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_file_type_name_extension_key" ON "dataset_file_type"("name", "extension");

-- CreateIndex
CREATE UNIQUE INDEX "upload_log_dataset_id_key" ON "upload_log"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_is_duplicate_version_key" ON "dataset"("name", "type", "is_deleted", "is_duplicate", "version");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_file_type_id_fkey" FOREIGN KEY ("file_type_id") REFERENCES "dataset_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_duplication" ADD CONSTRAINT "dataset_duplication_duplicate_dataset_id_fkey" FOREIGN KEY ("duplicate_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_duplication" ADD CONSTRAINT "dataset_duplication_original_dataset_id_fkey" FOREIGN KEY ("original_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_upload_log_id_fkey" FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_check" ADD CONSTRAINT "dataset_ingestion_check_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "dataset_action_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
