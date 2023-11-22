/*
  Warnings:

  - Changed the type of `status` on the `file_upload_log` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "upload_status" ADD VALUE 'VALIDATION_FAILED';

-- AlterTable
ALTER TABLE "file_upload_log" DROP COLUMN "status",
ADD COLUMN     "status" "upload_status" NOT NULL;

-- DropEnum
DROP TYPE "file_upload_status";
