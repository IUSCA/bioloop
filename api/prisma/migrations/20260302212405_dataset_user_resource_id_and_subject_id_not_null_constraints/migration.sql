/*
  Warnings:

  - Made the column `resource_id` on table `dataset` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subject_id` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "dataset" ALTER COLUMN "resource_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "subject_id" SET NOT NULL;
