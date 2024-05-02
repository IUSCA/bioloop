-- DropForeignKey
ALTER TABLE "bundle" DROP CONSTRAINT "bundle_dataset_id_fkey";

-- AddForeignKey
ALTER TABLE "bundle" ADD CONSTRAINT "bundle_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
