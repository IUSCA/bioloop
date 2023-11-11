-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('PROCESSING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "dataset_file_type_id" INTEGER;

-- CreateTable
CREATE TABLE "dataset_upload" (
    "id" SERIAL NOT NULL,
    "status" "upload_status" NOT NULL,
    "dataset_id" INTEGER,
    "created_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "dataset_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_file_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,

    CONSTRAINT "dataset_file_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_upload_dataset_id_key" ON "dataset_upload"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_file_type_name_extension_key" ON "dataset_file_type"("name", "extension");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_dataset_file_type_id_fkey" FOREIGN KEY ("dataset_file_type_id") REFERENCES "dataset_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_upload" ADD CONSTRAINT "dataset_upload_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_upload" ADD CONSTRAINT "dataset_upload_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
