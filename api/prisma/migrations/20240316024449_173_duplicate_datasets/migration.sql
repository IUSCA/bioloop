/*
  Warnings:

  - A unique constraint covering the columns `[name,type,is_deleted,version]` on the table `dataset` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DATASET_ACTION_ITEM_TYPE" AS ENUM ('DUPLICATE_DATASET_INGESTION');

-- CreateEnum
CREATE TYPE "NOTIFICATION_STATUS" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NOTIFICATION_TYPE" AS ENUM ('DATASET');

-- CreateEnum
CREATE TYPE "DATASET_INGESTION_CHECK_TYPE" AS ENUM ('FILE_COUNT', 'CHECKSUMS_MATCH', 'FILES_MISSING_FROM_DUPLICATE', 'FILES_MISSING_FROM_ORIGINAL');

-- DropIndex
DROP INDEX "dataset_name_type_is_deleted_key";

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "duplicate_dataset" (
    "original_dataset_id" INTEGER NOT NULL,
    "duplicate_dataset_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_dataset_pkey" PRIMARY KEY ("original_dataset_id","duplicate_dataset_id")
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
    "type" "DATASET_ACTION_ITEM_TYPE" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notification_id" INTEGER,
    "dataset_id" INTEGER,
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
CREATE UNIQUE INDEX "duplicate_dataset_original_dataset_id_key" ON "duplicate_dataset"("original_dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_dataset_duplicate_dataset_id_key" ON "duplicate_dataset"("duplicate_dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_version_key" ON "dataset"("name", "type", "is_deleted", "version");

-- AddForeignKey
ALTER TABLE "duplicate_dataset" ADD CONSTRAINT "duplicate_dataset_original_dataset_id_fkey" FOREIGN KEY ("original_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_dataset" ADD CONSTRAINT "duplicate_dataset_duplicate_dataset_id_fkey" FOREIGN KEY ("duplicate_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_check" ADD CONSTRAINT "dataset_ingestion_check_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "dataset_action_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;