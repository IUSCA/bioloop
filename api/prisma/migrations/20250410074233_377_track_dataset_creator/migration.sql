-- CreateTable
CREATE TABLE "import_log" (
    "id" SERIAL NOT NULL,
    "initiated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creator_id" INTEGER NOT NULL,
    "dataset_id" INTEGER NOT NULL,

    CONSTRAINT "import_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_log_dataset_id_key" ON "import_log"("dataset_id");

-- AddForeignKey
ALTER TABLE "import_log" ADD CONSTRAINT "import_log_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_log" ADD CONSTRAINT "import_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
