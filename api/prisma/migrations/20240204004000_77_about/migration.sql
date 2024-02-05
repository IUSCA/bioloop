-- CreateTable
CREATE TABLE "about" (
    "id" SERIAL NOT NULL,
    "version" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INTEGER NOT NULL,

    CONSTRAINT "about_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "about" ADD CONSTRAINT "about_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
