/*
  Warnings:

  - You are about to drop the column `details` on the `ingestion_action_item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ingestion_action_item" DROP COLUMN "details",
ADD COLUMN     "checks" JSONB;
