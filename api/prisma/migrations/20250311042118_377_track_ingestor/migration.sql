/*
  Warnings:

  - A unique constraint covering the columns `[ingestor_id]` on the table `dataset` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "ingestor_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "dataset_ingestor_id_key" ON "dataset"("ingestor_id");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_ingestor_id_fkey" FOREIGN KEY ("ingestor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
