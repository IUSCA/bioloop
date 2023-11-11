-- CreateTable
CREATE TABLE "file_upload" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "num_chunks" INTEGER,
    "dataset_upload_id" INTEGER,

    CONSTRAINT "file_upload_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "file_upload" ADD CONSTRAINT "file_upload_dataset_upload_id_fkey" FOREIGN KEY ("dataset_upload_id") REFERENCES "dataset_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
