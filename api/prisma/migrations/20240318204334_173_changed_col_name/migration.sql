/*
  Warnings:

  - You are about to drop the column `to` on the `dataset_action_item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "dataset_action_item" DROP COLUMN "to",
ADD COLUMN     "redirect_url" TEXT;
