/*
  Warnings:

  - Changed the type of `type` on the `dataset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "dataset_type" AS ENUM ('RAW_DATA', 'DATA_PRODUCT', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "NOTIFICATION_TYPE" AS ENUM ('DUPLICATE_INGESTION');

-- CreateEnum
CREATE TYPE "DATASET_INGESTION_CHECK_TYPE" AS ENUM ('FILE_COUNT', 'CHECKSUMS_MATCH', 'NO_MISSING_FILES');

-- AlterTable
ALTER TABLE "dataset"
  ALTER COLUMN "type"
    SET DATA TYPE "dataset_type"
    USING "type"::text::"dataset_type";

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "NOTIFICATION_TYPE" NOT NULL,
    "label" TEXT,
    "dataset_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "acknowledged_by_id" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_ingestion_check" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "DATASET_INGESTION_CHECK_TYPE" NOT NULL,
    "label" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "notification_id" INTEGER,
    "report" JSONB,

    CONSTRAINT "dataset_ingestion_check_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX "dataset_name_type_is_deleted_key";

-- CreateIndex
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_key" ON "dataset"("name", "type", "is_deleted");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_check" ADD CONSTRAINT "dataset_ingestion_check_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;