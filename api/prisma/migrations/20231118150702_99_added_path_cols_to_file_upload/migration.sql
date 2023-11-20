/*
  Warnings:

  - You are about to drop the column `path` on the `file_upload` table. All the data in the column will be lost.
  - Added the required column `chunks_path` to the `file_upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination_path` to the `file_upload` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "file_upload" DROP COLUMN "path",
ADD COLUMN     "chunks_path" TEXT NOT NULL,
ADD COLUMN     "destination_path" TEXT NOT NULL;
