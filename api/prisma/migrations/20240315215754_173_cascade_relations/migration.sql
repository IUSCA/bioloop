-- DropForeignKey
ALTER TABLE "duplicate_dataset" DROP CONSTRAINT "duplicate_dataset_duplicate_dataset_id_fkey";

-- DropForeignKey
ALTER TABLE "duplicate_dataset" DROP CONSTRAINT "duplicate_dataset_original_dataset_id_fkey";

-- AddForeignKey
ALTER TABLE "duplicate_dataset" ADD CONSTRAINT "duplicate_dataset_original_dataset_id_fkey" FOREIGN KEY ("original_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_dataset" ADD CONSTRAINT "duplicate_dataset_duplicate_dataset_id_fkey" FOREIGN KEY ("duplicate_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
