/*
  Warnings:

  - A unique constraint covering the columns `[original_dataset_id]` on the table `duplicate_dataset` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "duplicate_dataset_original_dataset_id_key" ON "duplicate_dataset"("original_dataset_id");
