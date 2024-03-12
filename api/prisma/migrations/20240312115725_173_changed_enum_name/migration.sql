/*
  Warnings:

  - Changed the type of `type` on the `dataset_action_item` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `dataset_ingestion_check` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "DATASET_ACTION_ITEM_TYPE" AS ENUM ('DUPLICATE_INGESTION');

-- CreateEnum
CREATE TYPE "DATASET_INGESTION_CHECK_TYPE" AS ENUM ('FILE_COUNT', 'CHECKSUMS_MATCH', 'NO_MISSING_FILES');

-- AlterTable
ALTER TABLE "dataset_action_item" DROP COLUMN "type",
ADD COLUMN     "type" "DATASET_ACTION_ITEM_TYPE" NOT NULL;

-- AlterTable
ALTER TABLE "dataset_ingestion_check" DROP COLUMN "type",
ADD COLUMN     "type" "DATASET_INGESTION_CHECK_TYPE" NOT NULL;

-- DropEnum
DROP TYPE "DATASET_INGESTION_CHECKS";

-- DropEnum
DROP TYPE "NOTIFICATION_TYPE";
