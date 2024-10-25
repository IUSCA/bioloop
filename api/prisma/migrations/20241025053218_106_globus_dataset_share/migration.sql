-- CreateTable
CREATE TABLE "dataset_share" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataset_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "globus_share_id" INTEGER,
    "source_file_path" TEXT NOT NULL,
    "destination_file_path" TEXT NOT NULL,

    CONSTRAINT "dataset_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "globus_share" (
    "id" SERIAL NOT NULL,
    "source_collection_id" TEXT NOT NULL,
    "destination_collection_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "globus_share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_share_globus_share_id_key" ON "dataset_share"("globus_share_id");

-- AddForeignKey
ALTER TABLE "dataset_share" ADD CONSTRAINT "dataset_share_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_share" ADD CONSTRAINT "dataset_share_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_share" ADD CONSTRAINT "dataset_share_globus_share_id_fkey" FOREIGN KEY ("globus_share_id") REFERENCES "globus_share"("id") ON DELETE SET NULL ON UPDATE CASCADE;
