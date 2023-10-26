-- CreateTable
CREATE TABLE "auth_state" (
    "state" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_state_pkey" PRIMARY KEY ("state")
);
