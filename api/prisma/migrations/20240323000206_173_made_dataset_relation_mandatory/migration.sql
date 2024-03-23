/*
  Warnings:

  - Made the column `dataset_id` on table `dataset_action_item` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "dataset_action_item" ALTER COLUMN "dataset_id" SET NOT NULL;
