-- AlterTable
ALTER TABLE "grant" ADD COLUMN     "source_preset_id" INTEGER;

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_source_preset_id_fkey" FOREIGN KEY ("source_preset_id") REFERENCES "grant_preset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
