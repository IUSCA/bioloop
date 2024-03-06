/*
  Warnings:

  - You are about to drop the `action_item` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "action_item" DROP CONSTRAINT "action_item_acknowledged_by_id_fkey";

-- DropForeignKey
ALTER TABLE "action_item" DROP CONSTRAINT "action_item_dataset_id_fkey";

-- DropTable
DROP TABLE "action_item";

-- CreateTable
CREATE TABLE "ingestion_action_item" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "ACTION_ITEM_TYPE" NOT NULL,
    "label" TEXT,
    "original_dataset_id" INTEGER,
    "duplicate_dataset_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "acknowledged_by_id" INTEGER,

    CONSTRAINT "ingestion_action_item_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ingestion_action_item" ADD CONSTRAINT "ingestion_action_item_original_dataset_id_fkey" FOREIGN KEY ("original_dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_action_item" ADD CONSTRAINT "ingestion_action_item_duplicate_dataset_id_fkey" FOREIGN KEY ("duplicate_dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_action_item" ADD CONSTRAINT "ingestion_action_item_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
