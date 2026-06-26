/*
  Warnings:

  - You are about to drop the column `created_grant_id` on the `access_request_item` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[access_request_id,preset_id]` on the table `access_request_item` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "access_request_item" DROP CONSTRAINT "access_request_item_created_grant_id_fkey";

-- AlterTable
ALTER TABLE "access_request_item" DROP COLUMN "created_grant_id",
ADD COLUMN     "preset_id" INTEGER,
ALTER COLUMN "access_type_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "grant" ADD COLUMN     "source_access_request_id" TEXT;

-- CreateTable
CREATE TABLE "grant_preset" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grant_preset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_preset_item" (
    "preset_id" INTEGER NOT NULL,
    "access_type_id" INTEGER NOT NULL,

    CONSTRAINT "grant_preset_item_pkey" PRIMARY KEY ("preset_id","access_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grant_preset_name_key" ON "grant_preset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "grant_preset_slug_key" ON "grant_preset"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "access_request_item_access_request_id_preset_id_key" ON "access_request_item"("access_request_id", "preset_id");

-- AddForeignKey
ALTER TABLE "grant" ADD CONSTRAINT "grant_source_access_request_id_fkey" FOREIGN KEY ("source_access_request_id") REFERENCES "access_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_preset_item" ADD CONSTRAINT "grant_preset_item_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "grant_preset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_preset_item" ADD CONSTRAINT "grant_preset_item_access_type_id_fkey" FOREIGN KEY ("access_type_id") REFERENCES "grant_access_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_item" ADD CONSTRAINT "access_request_item_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "grant_preset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Mutually exclusive constriant
ALTER TABLE access_request_item
  ADD CONSTRAINT chk_item_exactly_one_type CHECK (
    (preset_id IS NOT NULL AND access_type_id IS NULL)
    OR
    (preset_id IS NULL AND access_type_id IS NOT NULL)
  );