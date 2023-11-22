-- AddForeignKey
ALTER TABLE "dataset_hierarchy" ADD CONSTRAINT "dataset_hierarchy_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_hierarchy" ADD CONSTRAINT "dataset_hierarchy_derived_id_fkey" FOREIGN KEY ("derived_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
