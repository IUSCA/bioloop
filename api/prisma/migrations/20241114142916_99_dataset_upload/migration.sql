-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('UPLOADING', 'UPLOAD_FAILED', 'UPLOADED', 'PROCESSING', 'PROCESSING_FAILED', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "upload_type" AS ENUM ('DATASET');

-- CreateTable
CREATE TABLE "upload_log" (
    "id" SERIAL NOT NULL,
    "status" "upload_status" NOT NULL,
    "initiated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_upload_log" (
    "id" SERIAL NOT NULL,
    "dataset_id" INTEGER NOT NULL,
    "upload_log_id" INTEGER NOT NULL,

    CONSTRAINT "dataset_upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_upload_log" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "md5" TEXT NOT NULL,
    "num_chunks" INTEGER NOT NULL,
    "status" "upload_status" NOT NULL,
    "path" TEXT,
    "upload_log_id" INTEGER,

    CONSTRAINT "file_upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_notification" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "notification_id" INTEGER NOT NULL,

    CONSTRAINT "role_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notification_id" INTEGER NOT NULL,

    CONSTRAINT "user_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_upload_log_dataset_id_key" ON "dataset_upload_log"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_upload_log_upload_log_id_key" ON "dataset_upload_log"("upload_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_notification_notification_id_role_id_key" ON "role_notification"("notification_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_notification_id_user_id_key" ON "user_notification"("notification_id", "user_id");

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_upload_log" ADD CONSTRAINT "dataset_upload_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_upload_log" ADD CONSTRAINT "dataset_upload_log_upload_log_id_fkey" FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_upload_log_id_fkey" FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_notification" ADD CONSTRAINT "role_notification_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_notification" ADD CONSTRAINT "role_notification_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
