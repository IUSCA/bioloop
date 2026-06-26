-- Add dataset_import_log table for import history tracking.

CREATE TABLE "dataset_import_log" (
  "id" SERIAL NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_run" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "dataset_id" INTEGER NOT NULL,
  CONSTRAINT "dataset_import_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dataset_import_log_dataset_id_idx" ON "dataset_import_log"("dataset_id");

ALTER TABLE "dataset_import_log"
  ADD CONSTRAINT "dataset_import_log_dataset_id_fkey"
  FOREIGN KEY ("dataset_id")
  REFERENCES "dataset"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
