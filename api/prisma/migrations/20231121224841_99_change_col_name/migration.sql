/*
  Warnings:

  - You are about to drop the column `retry_count` on the `dataset_upload` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "dataset_upload" DROP COLUMN "retry_count",
ADD COLUMN     "processing_attempt_count" INTEGER NOT NULL DEFAULT 0;
