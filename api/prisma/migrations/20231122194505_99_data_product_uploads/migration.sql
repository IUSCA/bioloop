-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('UPLOADING', 'UPLOAD_FAILED', 'UPLOADED', 'PROCESSING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "file_type_id" INTEGER;

-- CreateTable
CREATE TABLE "upload_log" (
    "id" SERIAL NOT NULL,
    "status" "upload_status" NOT NULL,
    "dataset_id" INTEGER,
    "last_updated" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_upload_log" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "md5" TEXT NOT NULL,
    "num_chunks" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "chunks_path" TEXT NOT NULL,
    "destination_path" TEXT NOT NULL,
    "upload_log_id" INTEGER,

    CONSTRAINT "file_upload_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_file_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,

    CONSTRAINT "dataset_file_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_log_dataset_id_key" ON "upload_log"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_file_type_name_extension_key" ON "dataset_file_type"("name", "extension");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_file_type_id_fkey" FOREIGN KEY ("file_type_id") REFERENCES "dataset_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_upload_log_id_fkey" FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;
