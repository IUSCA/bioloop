-- AlterTable
ALTER TABLE "upload_log" ADD COLUMN     "user_id" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
