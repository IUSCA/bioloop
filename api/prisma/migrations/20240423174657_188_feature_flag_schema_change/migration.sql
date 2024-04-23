/*
  Warnings:

  - You are about to drop the column `features` on the `feature_flag` table. All the data in the column will be lost.
  - Added the required column `feature` to the `feature_flag` table without a default value. This is not possible if the table is not empty.
  - Added the required column `last_updated_by_id` to the `feature_flag` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "feature_flag" DROP COLUMN "features",
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "feature" TEXT NOT NULL,
ADD COLUMN     "last_updated_by_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
