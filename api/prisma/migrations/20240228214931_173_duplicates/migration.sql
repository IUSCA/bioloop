/*
  Warnings:

  - Changed the type of `type` on the `dataset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/

/*

The Prisma warnings from above are addressed below.
The current values of column `text` are casted to the new enum.
Also, the existing index is dropped and recreated.
For more info, see https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations#example-rename-a-field

*/

-- CreateEnum
CREATE TYPE "dataset_type" AS ENUM ('RAW_DATA', 'DATA_PRODUCT', 'DUPLICATE');

-- AlterTable
ALTER TABLE "dataset"
  ALTER COLUMN "type"
    SET DATA TYPE "dataset_type"
    USING type::text::dataset_type;

DROP INDEX "dataset_name_type_is_deleted_key";

-- CreateIndex
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_key" ON "dataset"("name", "type", "is_deleted");
