-- AddForeignKey
ALTER TABLE "file_upload_log" ADD CONSTRAINT "file_upload_log_upload_log_id_fkey" FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;
