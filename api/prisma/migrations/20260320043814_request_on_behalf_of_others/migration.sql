/*
  Warnings:

  - Added the required column `subject_id` to the `access_request` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "access_request_status_submitted_at_idx";

-- AlterTable
ALTER TABLE "access_request" ADD COLUMN     "subject_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "access_request_subject_id_status_idx" ON "access_request"("subject_id", "status");

-- CreateIndex
CREATE INDEX "access_request_status_idx" ON "access_request"("status");

-- AddForeignKey
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
