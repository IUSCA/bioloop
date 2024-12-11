-- DropForeignKey
ALTER TABLE "about" DROP CONSTRAINT "about_last_updated_by_id_fkey";

-- DropForeignKey
ALTER TABLE "data_access_log" DROP CONSTRAINT "data_access_log_user_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_audit" DROP CONSTRAINT "dataset_audit_user_id_fkey";

-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_acknowledged_by_id_fkey";

-- DropForeignKey
ALTER TABLE "stage_request_log" DROP CONSTRAINT "stage_request_log_user_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_log" DROP CONSTRAINT "upload_log_user_id_fkey";

-- AlterTable
ALTER TABLE "about" ALTER COLUMN "last_updated_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "data_access_log" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "stage_request_log" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "upload_log" ALTER COLUMN "user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "upload_log" ADD CONSTRAINT "upload_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_audit" ADD CONSTRAINT "dataset_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_log" ADD CONSTRAINT "data_access_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_request_log" ADD CONSTRAINT "stage_request_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "about" ADD CONSTRAINT "about_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
