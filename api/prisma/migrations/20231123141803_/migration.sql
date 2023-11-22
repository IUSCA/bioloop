/*
  Warnings:

  - You are about to drop the column `file_type_id` on the `dataset` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `upload_log` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "dataset" DROP CONSTRAINT "dataset_file_type_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_hierarchy" DROP CONSTRAINT "dataset_hierarchy_derived_id_fkey";

-- DropForeignKey
ALTER TABLE "file_upload_log" DROP CONSTRAINT "file_upload_log_upload_log_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_log" DROP CONSTRAINT "upload_log_user_id_fkey";

-- AlterTable
ALTER TABLE "dataset" DROP COLUMN "file_type_id";

-- AlterTable
ALTER TABLE "upload_log" DROP COLUMN "user_id";
