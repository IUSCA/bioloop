-- AlterTable
ALTER TABLE "project_contact" ADD COLUMN     "assignor_id" INTEGER;

-- AlterTable
ALTER TABLE "project_dataset" ADD COLUMN     "assignor_id" INTEGER;

-- AlterTable
ALTER TABLE "project_user" ADD COLUMN     "assignor_id" INTEGER;

-- AddForeignKey
ALTER TABLE "project_user" ADD CONSTRAINT "project_user_assignor_id_fkey" FOREIGN KEY ("assignor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dataset" ADD CONSTRAINT "project_dataset_assignor_id_fkey" FOREIGN KEY ("assignor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contact" ADD CONSTRAINT "project_contact_assignor_id_fkey" FOREIGN KEY ("assignor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
