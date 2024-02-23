-- CreateTable
CREATE TABLE "about" (
    "id" SERIAL NOT NULL,
    "html" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_by_id" INTEGER NOT NULL,

    CONSTRAINT "about_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "about" ADD CONSTRAINT "about_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
