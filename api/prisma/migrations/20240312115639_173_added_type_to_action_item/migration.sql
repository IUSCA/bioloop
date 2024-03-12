/*
  Warnings:

  - You are about to drop the column `type` on the `notification` table. All the data in the column will be lost.
  - Added the required column `type` to the `dataset_action_item` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "dataset_action_item" ADD COLUMN     "type" "NOTIFICATION_TYPE" NOT NULL;

-- AlterTable
ALTER TABLE "notification" DROP COLUMN "type";
