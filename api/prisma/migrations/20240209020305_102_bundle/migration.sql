/*
  Warnings:

  - You are about to drop the column `bundle_size` on the `dataset` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "dataset" DROP COLUMN "bundle_size";

-- CreateTable
CREATE TABLE "bundle" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" BIGINT,
    "md5" TEXT NOT NULL,
    "dataset_id" INTEGER NOT NULL,

    CONSTRAINT "bundle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bundle_dataset_id_key" ON "bundle"("dataset_id");

-- AddForeignKey
ALTER TABLE "bundle" ADD CONSTRAINT "bundle_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
