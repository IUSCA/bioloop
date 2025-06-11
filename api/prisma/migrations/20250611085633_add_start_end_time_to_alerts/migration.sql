/*
  Warnings:

  - You are about to drop the column `active` on the `alert` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "alert" DROP CONSTRAINT "alert_created_by_id_fkey";

-- AlterTable
ALTER TABLE "alert" DROP COLUMN "active",
ADD COLUMN     "end_time" TIMESTAMP(6),
ADD COLUMN     "start_time" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
