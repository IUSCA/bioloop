-- CreateEnum
CREATE TYPE "NOTIFICATION_DELIVERY_TYPE" AS ENUM ('ROLE_BROADCAST', 'DIRECT');

-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_acknowledged_by_id_fkey";

-- DropForeignKey
ALTER TABLE "role_notification" DROP CONSTRAINT "role_notification_role_id_fkey";

-- DropForeignKey
ALTER TABLE "role_notification" DROP CONSTRAINT "role_notification_notification_id_fkey";

-- DropForeignKey
ALTER TABLE "user_notification" DROP CONSTRAINT "user_notification_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_notification" DROP CONSTRAINT "user_notification_notification_id_fkey";

-- AlterTable
ALTER TABLE "notification" DROP COLUMN "acknowledged_by_id",
DROP COLUMN "status",
ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "role_notification";

-- DropTable
DROP TABLE "user_notification";

-- DropEnum
DROP TYPE "NOTIFICATION_STATUS";

-- CreateTable
CREATE TABLE "notification_recipient" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "delivery_type" "NOTIFICATION_DELIVERY_TYPE" NOT NULL,
    "delivery_role_id" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "is_bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(6),
    "archived_at" TIMESTAMP(6),
    "bookmarked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_recipient_user_id_is_archived_is_read_is_bookm_idx" ON "notification_recipient"("user_id", "is_archived", "is_read", "is_bookmarked");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipient_notification_id_user_id_key" ON "notification_recipient"("notification_id", "user_id");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipient" ADD CONSTRAINT "notification_recipient_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipient" ADD CONSTRAINT "notification_recipient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipient" ADD CONSTRAINT "notification_recipient_delivery_role_id_fkey" FOREIGN KEY ("delivery_role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

