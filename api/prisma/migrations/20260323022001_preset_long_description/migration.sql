/*
  Warnings:

  - You are about to drop the column `slug` on the `grant_preset` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "grant_preset_slug_key";

-- AlterTable
ALTER TABLE "grant_access_type" ADD COLUMN     "long_description" TEXT;

-- AlterTable
ALTER TABLE "grant_preset" DROP COLUMN "slug",
ADD COLUMN     "long_description" TEXT;
