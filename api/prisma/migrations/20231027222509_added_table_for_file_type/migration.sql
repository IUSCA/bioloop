/*
  Warnings:

  - You are about to drop the column `data_product_file_type` on the `dataset` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "dataset" DROP COLUMN "data_product_file_type",
ADD COLUMN     "data_product_file_typeId" INTEGER;

-- CreateTable
CREATE TABLE "data_product_file_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,

    CONSTRAINT "data_product_file_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_product_file_type_name_extension_key" ON "data_product_file_type"("name", "extension");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_data_product_file_typeId_fkey" FOREIGN KEY ("data_product_file_typeId") REFERENCES "data_product_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
