-- CreateTable
CREATE TABLE "track" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "file_type" TEXT,
    "genomeType" TEXT NOT NULL,
    "genomeValue" TEXT NOT NULL,
    "dataset_file_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "track_dataset_file_id_key" ON "track"("dataset_file_id");

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_dataset_file_id_fkey" FOREIGN KEY ("dataset_file_id") REFERENCES "dataset_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;
