/*
  Warnings:

  - Added the required column `type` to the `dataset_action_item_check` table without a default value. This is not possible if the table is not empty.
  - Made the column `label` on table `dataset_action_item_check` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ACTION_ITEM_CHECK_TYPE" AS ENUM ('FILE_COUNT', 'CHECKSUMS_MATCH', 'NO_MISSING_FILES');

-- AlterTable
ALTER TABLE "dataset_action_item_check" ADD COLUMN     "type" "ACTION_ITEM_CHECK_TYPE" NOT NULL,
ALTER COLUMN "label" SET NOT NULL;
