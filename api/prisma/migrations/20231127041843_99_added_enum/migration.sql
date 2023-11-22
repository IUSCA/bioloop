/*
  Warnings:

  - Changed the type of `status` on the `file_upload_log` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "file_upload_status" AS ENUM ('UPLOADING', 'UPLOADED', 'PROCESSING', 'COMPLETE', 'VALIDATION_FAILED');

-- AlterTable
ALTER TABLE "file_upload_log" DROP COLUMN "status",
ADD COLUMN     "status" "file_upload_status" NOT NULL;
