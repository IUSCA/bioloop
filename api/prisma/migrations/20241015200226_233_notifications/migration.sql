-- CreateEnum
CREATE TYPE "NOTIFICATION_STATUS" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT NOT NULL,
    "text" TEXT,
    "status" "NOTIFICATION_STATUS" NOT NULL DEFAULT 'CREATED',
    "acknowledged_by_id" INTEGER,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
