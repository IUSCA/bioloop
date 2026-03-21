-- CreateEnum
CREATE TYPE "GRANT_REVOCATION_TYPE" AS ENUM ('MANUAL', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "access_request_item" ADD COLUMN     "source_preset_name" TEXT;

-- AlterTable
ALTER TABLE "grant" ADD COLUMN     "revocation_type" "GRANT_REVOCATION_TYPE";
