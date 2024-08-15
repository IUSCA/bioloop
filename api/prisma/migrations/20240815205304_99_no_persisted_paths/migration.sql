/*
  Warnings:

  - You are about to drop the column `chunks_path` on the `file_upload_log` table. All the data in the column will be lost.
  - You are about to drop the column `destination_path` on the `file_upload_log` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "file_upload_log" DROP COLUMN "chunks_path",
DROP COLUMN "destination_path";
