/*
  Warnings:

  - Changed the type of `type` on the `action_item` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ACTION_ITEM_TYPE" AS ENUM ('DUPLICATE_INGESTION');

-- AlterTable
ALTER TABLE "action_item" DROP COLUMN "type",
ADD COLUMN     "type" "ACTION_ITEM_TYPE" NOT NULL;

-- DropEnum
DROP TYPE "ACTION_ITEM";
