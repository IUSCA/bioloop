-- AlterEnum
ALTER TYPE "upload_status" ADD VALUE 'UPLOADED';

-- AlterTable
ALTER TABLE "dataset_upload" ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0;
