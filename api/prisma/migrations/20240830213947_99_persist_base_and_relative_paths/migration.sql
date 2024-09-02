/*
  Warnings:

  - You are about to drop the column `path` on the `file_upload_log` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "file_upload_log" DROP COLUMN "path",
ADD COLUMN     "base_path" TEXT,
ADD COLUMN     "relative_path" TEXT;
