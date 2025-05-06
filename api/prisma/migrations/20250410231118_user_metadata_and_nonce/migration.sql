-- AlterTable
ALTER TABLE "user" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "nonce" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "nonce_pkey" PRIMARY KEY ("id")
);
