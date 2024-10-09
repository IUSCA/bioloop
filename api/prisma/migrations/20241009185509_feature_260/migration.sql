-- CreateEnum
CREATE TYPE "METRICS_ACTION_ITEM_TYPE" AS ENUM ('METRICS_THRESHOLD_EXCEEDED');

-- CreateTable
CREATE TABLE "metrics_action_item" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "text" TEXT,
    "redirect_url" TEXT,
    "type" "METRICS_ACTION_ITEM_TYPE" NOT NULL,
    "status" "NOTIFICATION_STATUS" NOT NULL DEFAULT 'CREATED',
    "notification_id" INTEGER NOT NULL,

    CONSTRAINT "metrics_action_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metrics_action_item_notification_id_key" ON "metrics_action_item"("notification_id");

-- AddForeignKey
ALTER TABLE "metrics_action_item" ADD CONSTRAINT "metrics_action_item_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
