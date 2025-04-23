/*
  Warnings:

  - You are about to drop the column `dataset_id` on the `dataset_upload_log` table. All the data in the column will be lost.
  - You are about to drop the column `upload_log_id` on the `dataset_upload_log` table. All the data in the column will be lost.
  - You are about to drop the column `upload_log_id` on the `file_upload_log` table. All the data in the column will be lost.
  - You are about to drop the `upload_log` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[dataset_id,create_method]` on the table `dataset_audit` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[audit_log_id]` on the table `dataset_upload_log` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `audit_log_id` to the `dataset_upload_log` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `dataset_upload_log` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DATASET_CREATE_METHOD" AS ENUM ('UPLOAD', 'IMPORT', 'SCAN');

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
ALTER TABLE "dataset" ADD COLUMN     "instrumentId" INTEGER;

-- AlterTable
ALTER TABLE "dataset_audit" ADD COLUMN     "create_method" "DATASET_CREATE_METHOD",
ADD COLUMN     "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "dataset_upload_log" DROP COLUMN "dataset_id",
DROP COLUMN "upload_log_id",
ADD COLUMN     "audit_log_id" INTEGER NOT NULL,
ADD COLUMN     "status" "upload_status" NOT NULL;

-- AlterTable
ALTER TABLE "file_upload_log" DROP COLUMN "upload_log_id",
ADD COLUMN     "dataset_upload_log_id" INTEGER;

-- DropTable
DROP TABLE "upload_log";

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
CREATE UNIQUE INDEX "instrument_name_key" ON "instrument"("name");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_host_key" ON "instrument"("host");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_audit_dataset_id_create_method_key" ON "dataset_audit"("dataset_id", "create_method");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_upload_log_audit_log_id_key" ON "dataset_upload_log"("audit_log_id");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_upload_log" ADD CONSTRAINT "dataset_upload_log_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "dataset_audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_dataset_upload_log_id_fkey" FOREIGN KEY ("dataset_upload_log_id") REFERENCES "dataset_upload_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;
