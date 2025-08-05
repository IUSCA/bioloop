-- CreateTable
CREATE TABLE "genome_browser_session" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "genome" TEXT NOT NULL,
    "genome_type" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "staging_requested" JSONB,
    "staging_completed" BOOLEAN NOT NULL DEFAULT false,
    "staging_requested_by" INTEGER,

    CONSTRAINT "genome_browser_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_track" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "track_id" INTEGER NOT NULL,
    "color" TEXT,
    "title" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_track_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_track_session_id_track_id_key" ON "session_track"("session_id", "track_id");

-- AddForeignKey
ALTER TABLE "genome_browser_session" ADD CONSTRAINT "genome_browser_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_track" ADD CONSTRAINT "session_track_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "genome_browser_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_track" ADD CONSTRAINT "session_track_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
