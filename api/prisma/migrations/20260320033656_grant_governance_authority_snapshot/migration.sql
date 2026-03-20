-- AlterTable
ALTER TABLE "grant" ADD COLUMN     "issuing_authority_id" TEXT,
ADD COLUMN     "revocation_reason" TEXT,
ADD COLUMN     "revoking_authority_id" TEXT;

-- CreateIndex
CREATE INDEX "dataset_owner_group_id_idx" ON "dataset"("owner_group_id");

-- CreateIndex
CREATE INDEX "dataset_resource_id_idx" ON "dataset"("resource_id");

-- CreateIndex
CREATE INDEX "user_subject_id_idx" ON "user"("subject_id");

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_issuing_authority_id_fkey" FOREIGN KEY ("issuing_authority_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_revoking_authority_id_fkey" FOREIGN KEY ("revoking_authority_id") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
