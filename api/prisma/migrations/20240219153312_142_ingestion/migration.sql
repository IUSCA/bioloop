-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "file_type_id" INTEGER;

-- CreateTable
CREATE TABLE "dataset_file_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,

    CONSTRAINT "dataset_file_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_file_type_name_extension_key" ON "dataset_file_type"("name", "extension");

-- AddForeignKey
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_file_type_id_fkey" FOREIGN KEY ("file_type_id") REFERENCES "dataset_file_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
