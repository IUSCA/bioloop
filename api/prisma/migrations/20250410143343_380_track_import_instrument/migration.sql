-- AlterTable
ALTER TABLE "import_log" ADD COLUMN     "instrument_id" INTEGER;

-- CreateTable
CREATE TABLE "instrument" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instrument_name_key" ON "instrument"("name");

-- CreateIndex
CREATE UNIQUE INDEX "instrument_host_key" ON "instrument"("host");

-- AddForeignKey
ALTER TABLE "import_log" ADD CONSTRAINT "import_log_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
