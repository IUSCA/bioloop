-- CreateTable
CREATE TABLE "feature_flag" (
    "id" SERIAL NOT NULL,
    "features" JSONB NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);
