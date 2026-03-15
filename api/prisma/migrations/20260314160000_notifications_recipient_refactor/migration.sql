-- Destructive reset for notifications model.
-- Existing notification data is intentionally not preserved.
DROP TABLE "role_notification";
DROP TABLE "user_notification";
DROP TABLE "notification";
DROP TYPE "NOTIFICATION_STATUS";

CREATE TYPE "NOTIFICATION_DELIVERY_TYPE" AS ENUM ('ROLE_BROADCAST', 'DIRECT');

CREATE TABLE "notification" (
  "id" SERIAL NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" INTEGER,
  "type" TEXT,
  "label" TEXT NOT NULL,
  "text" TEXT,
  "metadata" JSONB,
  CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_recipient" (
  "id" SERIAL NOT NULL,
  "notification_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "delivery_type" "NOTIFICATION_DELIVERY_TYPE" NOT NULL,
  "delivery_role_id" INTEGER,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "is_bookmarked" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMP(6),
  "archived_at" TIMESTAMP(6),
  "bookmarked_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_recipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_recipient_notification_id_user_id_key"
  ON "notification_recipient"("notification_id", "user_id");

CREATE INDEX "notification_recipient_user_id_is_archived_is_read_is_bookmarked_idx"
  ON "notification_recipient"("user_id", "is_archived", "is_read", "is_bookmarked");

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "user"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "notification_recipient"
  ADD CONSTRAINT "notification_recipient_notification_id_fkey"
  FOREIGN KEY ("notification_id") REFERENCES "notification"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "notification_recipient"
  ADD CONSTRAINT "notification_recipient_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "notification_recipient"
  ADD CONSTRAINT "notification_recipient_delivery_role_id_fkey"
  FOREIGN KEY ("delivery_role_id") REFERENCES "role"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
