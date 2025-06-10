/*
  Warnings:

  - You are about to drop the column `global` on the `alert` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "alert" DROP COLUMN "global",
ALTER COLUMN "active" SET DEFAULT true;
