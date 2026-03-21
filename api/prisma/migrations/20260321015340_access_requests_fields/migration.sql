/*
  Warnings:

  - You are about to drop the column `source_preset_name` on the `access_request_item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "access_request_item" DROP COLUMN "source_preset_name",
ADD COLUMN     "approved_until" TIMESTAMP(3);
