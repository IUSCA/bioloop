-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "file_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_file_type_id_fkey" FOREIGN KEY ("file_type_id") REFERENCES "dataset_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
