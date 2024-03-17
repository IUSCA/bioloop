/*
  Warnings:

  - The primary key for the `duplicate_dataset` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropIndex
DROP INDEX "duplicate_dataset_duplicate_dataset_id_key";

-- DropIndex
DROP INDEX "duplicate_dataset_original_dataset_id_key";

-- AlterTable
ALTER TABLE "duplicate_dataset" DROP CONSTRAINT "duplicate_dataset_pkey",
ADD CONSTRAINT "duplicate_dataset_pkey" PRIMARY KEY ("duplicate_dataset_id");
