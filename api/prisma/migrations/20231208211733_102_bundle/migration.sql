-- CreateTable
CREATE TABLE "bundle" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER,
    "md5" TEXT NOT NULL,
    "dataset_id" INTEGER,

    CONSTRAINT "bundle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bundle_dataset_id_key" ON "bundle"("dataset_id");

-- AddForeignKey
ALTER TABLE "bundle" ADD CONSTRAINT "bundle_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
