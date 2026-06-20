/*
  Warnings:

  - The primary key for the `notification` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `acknowledged_by_id` on the `notification` table. All the data in the column will be lost.
  - You are about to drop the column `label` on the `notification` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `notification` table. All the data in the column will be lost.
  - You are about to drop the column `text` on the `notification` table. All the data in the column will be lost.
  - You are about to drop the `role_notification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_notification` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `payload` to the `notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `notification` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_acknowledged_by_id_fkey";

-- DropForeignKey
ALTER TABLE "role_notification" DROP CONSTRAINT "role_notification_notification_id_fkey";

-- DropForeignKey
ALTER TABLE "role_notification" DROP CONSTRAINT "role_notification_role_id_fkey";

-- DropForeignKey
ALTER TABLE "user_notification" DROP CONSTRAINT "user_notification_notification_id_fkey";

-- DropForeignKey
ALTER TABLE "user_notification" DROP CONSTRAINT "user_notification_user_id_fkey";

-- AlterTable
ALTER TABLE "notification" DROP CONSTRAINT "notification_pkey",
DROP COLUMN "acknowledged_by_id",
DROP COLUMN "label",
DROP COLUMN "status",
DROP COLUMN "text",
ADD COLUMN     "body" TEXT,
ADD COLUMN     "is_read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payload" JSONB NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "user_id" INTEGER NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "notification_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "notification_id_seq";

-- DropTable
DROP TABLE "role_notification";

-- DropTable
DROP TABLE "user_notification";

-- DropEnum
DROP TYPE "NOTIFICATION_STATUS";

-- CreateIndex
CREATE INDEX "notification_user_id_is_read_idx" ON "notification"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notification_user_id_created_at_idx" ON "notification"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
