/*
  Warnings:

  - The values [DATASET] on the enum `NOTIFICATION_TYPE` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NOTIFICATION_TYPE_new" AS ENUM ('INCOMING_DUPLICATE_DATASET');
ALTER TABLE "notification" ALTER COLUMN "type" TYPE "NOTIFICATION_TYPE_new" USING ("type"::text::"NOTIFICATION_TYPE_new");
ALTER TYPE "NOTIFICATION_TYPE" RENAME TO "NOTIFICATION_TYPE_old";
ALTER TYPE "NOTIFICATION_TYPE_new" RENAME TO "NOTIFICATION_TYPE";
DROP TYPE "NOTIFICATION_TYPE_old";
COMMIT;