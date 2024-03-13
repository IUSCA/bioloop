-- DropForeignKey
ALTER TABLE "dataset_action_item" DROP CONSTRAINT "dataset_action_item_notification_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_ingestion_check" DROP CONSTRAINT "dataset_ingestion_check_action_item_id_fkey";

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_check" ADD CONSTRAINT "dataset_ingestion_check_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "dataset_action_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
