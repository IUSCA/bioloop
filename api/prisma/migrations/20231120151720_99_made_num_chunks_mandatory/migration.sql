/*
  Warnings:

  - Made the column `num_chunks` on table `file_upload` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "file_upload" ALTER COLUMN "num_chunks" SET NOT NULL;
