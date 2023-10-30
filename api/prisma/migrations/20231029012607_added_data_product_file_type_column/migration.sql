/*
  Warnings:

  - You are about to drop the column `data_product_file_typeId` on the `dataset` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "dataset" DROP CONSTRAINT "dataset_data_product_file_typeId_fkey";

-- AlterTable
ALTER TABLE "dataset" DROP COLUMN "data_product_file_typeId",
ADD COLUMN     "data_product_file_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_data_product_file_type_id_fkey" FOREIGN KEY ("data_product_file_type_id") REFERENCES "data_product_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
