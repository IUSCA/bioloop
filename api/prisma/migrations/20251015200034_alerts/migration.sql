-- CreateEnum
CREATE TYPE "ALERT_TYPE" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "alert" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INTEGER,
    "label" TEXT,
    "message" TEXT,
    "type" "ALERT_TYPE" NOT NULL,
    "start_time" TIMESTAMP(6),
    "end_time" TIMESTAMP(6),
    "is_hidden" BOOLEAN DEFAULT false,

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
