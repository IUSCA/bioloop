/*
  Warnings:

  - A unique constraint covering the columns `[name,type,is_deleted,is_duplicate]` on the table `dataset` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `type` to the `notification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DATASET_ACTION_ITEM_TYPE" AS ENUM ('DUPLICATE_DATASET_INGESTION');

-- CreateEnum
CREATE TYPE "DATASET_ACTION_ITEM_STATUS" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NOTIFICATION_TYPE" AS ENUM ('INCOMING_DUPLICATE_DATASET');

-- CreateEnum
CREATE TYPE "DATASET_INGESTION_CHECK_TYPE" AS ENUM ('FILE_COUNT', 'CHECKSUMS_MATCH', 'FILES_MISSING_FROM_DUPLICATE', 'FILES_MISSING_FROM_ORIGINAL');

-- DropIndex
DROP INDEX "dataset_name_type_is_deleted_key";

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "is_duplicate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "type" "NOTIFICATION_TYPE" NOT NULL;

-- CreateTable
CREATE TABLE "dataset_duplication" (
    "duplicate_dataset_id" INTEGER NOT NULL,
    "original_dataset_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_duplication_pkey" PRIMARY KEY ("duplicate_dataset_id")
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
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_is_duplicate_key" ON "dataset"("name", "type", "is_deleted", "is_duplicate");

-- AddForeignKey
ALTER TABLE "dataset_duplication" ADD CONSTRAINT "dataset_duplication_duplicate_dataset_id_fkey" FOREIGN KEY ("duplicate_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_duplication" ADD CONSTRAINT "dataset_duplication_original_dataset_id_fkey" FOREIGN KEY ("original_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_check" ADD CONSTRAINT "dataset_ingestion_check_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "dataset_action_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
