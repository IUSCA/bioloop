-- CreateEnum
CREATE TYPE "DATASET_INGESTION_CHECK_TYPE" AS ENUM ('EXACT_CONTENT_MATCHES', 'SAME_PATH_SAME_CONTENT', 'SAME_PATH_DIFFERENT_CONTENT', 'SAME_CONTENT_DIFFERENT_PATH', 'ONLY_IN_INCOMING', 'ONLY_IN_ORIGINAL');

-- CreateEnum
CREATE TYPE "DATASET_DUPLICATION_ANALYSIS_STATUS" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'NOT_DUPLICATE', 'FAILED');

-- AlterTable
ALTER TABLE "dataset" ADD COLUMN     "is_duplicate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dataset_duplication" (
    "duplicate_dataset_id" INTEGER NOT NULL,
    "original_dataset_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comparison_process_id" TEXT,
    "comparison_status" "DATASET_DUPLICATION_ANALYSIS_STATUS" NOT NULL DEFAULT 'PENDING',
    "comparison_fraction_done" DOUBLE PRECISION,
    "metadata" JSONB,

    CONSTRAINT "dataset_duplication_pkey" PRIMARY KEY ("duplicate_dataset_id")
);

-- CreateTable
CREATE TABLE "dataset_ingestion_file_check" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_id" INTEGER NOT NULL,
    "ingestion_check_id" INTEGER NOT NULL,
    "source_dataset_id" INTEGER NOT NULL,

    CONSTRAINT "dataset_ingestion_file_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_ingestion_check" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "DATASET_INGESTION_CHECK_TYPE" NOT NULL,
    "label" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "dataset_id" INTEGER NOT NULL,

    CONSTRAINT "dataset_ingestion_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_ingestion_file_check_ingestion_check_id_file_id_key" ON "dataset_ingestion_file_check"("ingestion_check_id", "file_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_ingestion_check_type_dataset_id_key" ON "dataset_ingestion_check"("type", "dataset_id");

-- CreateIndex
CREATE INDEX "dataset_file_md5_idx" ON "dataset_file"("md5");

-- AddForeignKey
ALTER TABLE "dataset_duplication" ADD CONSTRAINT "dataset_duplication_duplicate_dataset_id_fkey" FOREIGN KEY ("duplicate_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_duplication" ADD CONSTRAINT "dataset_duplication_original_dataset_id_fkey" FOREIGN KEY ("original_dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_file_check" ADD CONSTRAINT "dataset_ingestion_file_check_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "dataset_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_file_check" ADD CONSTRAINT "dataset_ingestion_file_check_ingestion_check_id_fkey" FOREIGN KEY ("ingestion_check_id") REFERENCES "dataset_ingestion_check"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_ingestion_check" ADD CONSTRAINT "dataset_ingestion_check_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
