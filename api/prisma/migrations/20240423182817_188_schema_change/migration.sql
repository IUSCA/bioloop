/*
  Warnings:

  - A unique constraint covering the columns `[feature]` on the table `feature_flag` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "feature_flag" ADD COLUMN     "label" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_feature_key" ON "feature_flag"("feature");
