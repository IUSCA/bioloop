/*
  Warnings:

  - You are about to drop the column `dataset_id` on the `dataset_upload_log` table. All the data in the column will be lost.
  - You are about to drop the column `upload_log_id` on the `dataset_upload_log` table. All the data in the column will be lost.
  - You are about to drop the column `upload_log_id` on the `file_upload_log` table. All the data in the column will be lost.
  - You are about to drop the `upload_log` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[create_log_id]` on the table `dataset_upload_log` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `create_log_id` to the `dataset_upload_log` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `dataset_upload_log` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "dataset_upload_log" DROP CONSTRAINT "dataset_upload_log_dataset_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_upload_log" DROP CONSTRAINT "dataset_upload_log_upload_log_id_fkey";

-- DropForeignKey
ALTER TABLE "file_upload_log" DROP CONSTRAINT "file_upload_log_upload_log_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_log" DROP CONSTRAINT "upload_log_user_id_fkey";

-- DropIndex
DROP INDEX "dataset_upload_log_dataset_id_key";

-- DropIndex
DROP INDEX "dataset_upload_log_upload_log_id_key";

-- AlterTable
ALTER TABLE "dataset_upload_log" DROP COLUMN "dataset_id",
DROP COLUMN "upload_log_id",
ADD COLUMN     "create_log_id" INTEGER NOT NULL,
ADD COLUMN     "status" "upload_status" NOT NULL;

-- AlterTable
ALTER TABLE "file_upload_log" DROP COLUMN "upload_log_id",
ADD COLUMN     "dataset_upload_log_id" INTEGER;

-- DropTable
DROP TABLE "upload_log";

-- CreateTable
CREATE TABLE "dataset_create_log" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataset_id" INTEGER NOT NULL,
    "creator_id" INTEGER,
    "instrument_id" INTEGER,

    CONSTRAINT "dataset_create_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrument" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_create_log_dataset_id_key" ON "dataset_create_log"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_name_key" ON "instrument"("name");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_host_key" ON "instrument"("host");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_upload_log_create_log_id_key" ON "dataset_upload_log"("create_log_id");

-- AddForeignKey
ALTER TABLE "dataset_create_log" ADD CONSTRAINT "dataset_create_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_create_log" ADD CONSTRAINT "dataset_create_log_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_create_log" ADD CONSTRAINT "dataset_create_log_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_upload_log" ADD CONSTRAINT "dataset_upload_log_create_log_id_fkey" FOREIGN KEY ("create_log_id") REFERENCES "dataset_create_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_dataset_upload_log_id_fkey" FOREIGN KEY ("dataset_upload_log_id") REFERENCES "dataset_upload_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;
