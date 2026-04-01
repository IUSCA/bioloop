-- AlterTable
ALTER TABLE "authorization_audit" ADD COLUMN     "resource_id" TEXT,
ADD COLUMN     "resource_name" TEXT,
ADD COLUMN     "resource_type" TEXT;
