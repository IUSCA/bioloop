-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "data_file_type_id" INTEGER;

-- CreateTable
CREATE TABLE "data_upload" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL,
    "dataset_id" INTEGER,
    "dataset_name" TEXT NOT NULL,
    "source_dataset_id" INTEGER NOT NULL,
    "data_file_type_id" INTEGER NOT NULL,
    "created_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "data_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_file_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,

    CONSTRAINT "data_file_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_upload_dataset_id_key" ON "data_upload"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_upload_source_dataset_id_key" ON "data_upload"("source_dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_file_type_name_extension_key" ON "data_file_type"("name", "extension");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_data_file_type_id_fkey" FOREIGN KEY ("data_file_type_id") REFERENCES "data_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_upload" ADD CONSTRAINT "data_upload_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_upload" ADD CONSTRAINT "data_upload_source_dataset_id_fkey" FOREIGN KEY ("source_dataset_id") REFERENCES "dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_upload" ADD CONSTRAINT "data_upload_data_file_type_id_fkey" FOREIGN KEY ("data_file_type_id") REFERENCES "data_file_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_upload" ADD CONSTRAINT "data_upload_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
