-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('UPLOADING', 'UPLOAD_FAILED', 'UPLOADED', 'PROCESSING', 'PROCESSING_FAILED', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "upload_log" (
    "id" SERIAL NOT NULL,
    "status" "upload_status" NOT NULL,
    "dataset_id" INTEGER,
    "initiated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "upload_log_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "upload_log_dataset_id_key" ON "upload_log"("dataset_id");

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_upload_log_id_fkey" FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;
