/*
  Warnings:

  - You are about to drop the column `status` on the `alert` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "alert" DROP COLUMN "status";

-- DropEnum
DROP TYPE "ALERT_STATUS";
