/*
  Warnings:

  - You are about to drop the column `resource_id` on the `authorization_audit` table. All the data in the column will be lost.
  - You are about to drop the column `resource_type` on the `authorization_audit` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "authorization_audit_target_type_target_id_idx";

-- AlterTable
ALTER TABLE "authorization_audit" DROP COLUMN "resource_id",
DROP COLUMN "resource_type",
ADD COLUMN     "actor_name" TEXT,
ADD COLUMN     "subject_id" TEXT,
ADD COLUMN     "subject_name" TEXT,
ADD COLUMN     "subject_type" TEXT,
ADD COLUMN     "target_name" TEXT,
ALTER COLUMN "target_type" DROP NOT NULL,
ALTER COLUMN "target_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "authorization_audit_subject_id_idx" ON "authorization_audit"("subject_id");

-- CreateIndex
CREATE INDEX "authorization_audit_target_id_idx" ON "authorization_audit"("target_id");
