/*
  Warnings:

  - Made the column `resource_id` on table `dataset` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subject_id` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "dataset" DROP CONSTRAINT "dataset_resource_id_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_subject_id_fkey";

-- AlterTable
ALTER TABLE "dataset" ALTER COLUMN "resource_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "subject_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
