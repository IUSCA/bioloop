/*
  Warnings:

  - Added the required column `path` to the `file_upload` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "file_upload" ADD COLUMN     "path" TEXT NOT NULL;
