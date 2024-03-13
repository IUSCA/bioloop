-- DropForeignKey
ALTER TABLE "dataset_action_item" DROP CONSTRAINT "dataset_action_item_dataset_id_fkey";

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
