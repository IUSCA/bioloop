-- CreateEnum
CREATE TYPE "KeyValueDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'JSON');

-- CreateTable
CREATE TABLE "keyword" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datatype" "KeyValueDataType" NOT NULL,

    CONSTRAINT "keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_value" (
    "id" SERIAL NOT NULL,
    "value" TEXT NOT NULL,
    "keyword_id" INTEGER NOT NULL,
    "dataset_id" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "keyword_value_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_name_key" ON "keyword"("name");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_value_keyword_id_dataset_id_key" ON "keyword_value"("keyword_id", "dataset_id");

-- AddForeignKey
ALTER TABLE "keyword_value" ADD CONSTRAINT "keyword_value_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "keyword"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_value" ADD CONSTRAINT "keyword_value_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
