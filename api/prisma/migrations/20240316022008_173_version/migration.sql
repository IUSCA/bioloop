/*
  Warnings:

  - A unique constraint covering the columns `[name,type,is_deleted,version]` on the table `dataset` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "dataset_name_type_is_deleted_key";

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "version" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_version_key" ON "dataset"("name", "type", "is_deleted", "version");
