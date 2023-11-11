/*
  Warnings:

  - Added the required column `path` to the `dataset_upload` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "dataset_upload" ADD COLUMN     "path" TEXT NOT NULL;
