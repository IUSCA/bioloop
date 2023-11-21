/*
  Warnings:

  - You are about to drop the column `created_date` on the `dataset_upload` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "dataset_upload" DROP COLUMN "created_date",
ADD COLUMN     "last_updated" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
