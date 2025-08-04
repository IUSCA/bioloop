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

-- CreateTable
CREATE TABLE "project_track" (
    "project_id" TEXT NOT NULL,
    "track_id" INTEGER NOT NULL,
    "assignor_id" INTEGER,
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_track_pkey" PRIMARY KEY ("project_id","track_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "track_dataset_file_id_key" ON "track"("dataset_file_id");

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_dataset_file_id_fkey" FOREIGN KEY ("dataset_file_id") REFERENCES "dataset_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_track" ADD CONSTRAINT "project_track_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_track" ADD CONSTRAINT "project_track_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_track" ADD CONSTRAINT "project_track_assignor_id_fkey" FOREIGN KEY ("assignor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
