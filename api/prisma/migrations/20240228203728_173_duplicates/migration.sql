/*
  Warnings:

  - Changed the type of `type` on the `dataset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "dataset_type" AS ENUM ('RAW_DATA', 'DATA_PRODUCT', 'DUPLUCATE');

-- AlterTable
ALTER TABLE "dataset" DROP COLUMN "type",
ADD COLUMN     "type" "dataset_type" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_key" ON "dataset"("name", "type", "is_deleted");
