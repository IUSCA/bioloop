/*
  Warnings:

  - You are about to drop the column `metadata` on the `notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "dataset_action_item" ADD COLUMN     "dataset_id" INTEGER,
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "notification" DROP COLUMN "metadata";

-- AddForeignKey
ALTER TABLE "dataset_action_item" ADD CONSTRAINT "dataset_action_item_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
