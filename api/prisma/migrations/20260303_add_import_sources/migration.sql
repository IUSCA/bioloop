CREATE TABLE "import_source" (
    "id"          SERIAL NOT NULL,
    "path"        TEXT NOT NULL,
    "label"       TEXT,
    "description" TEXT,
    "sort_order"  INTEGER,
    "owner_id"    INTEGER,
    "created_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_source_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "import_source_path_key" ON "import_source"("path");

ALTER TABLE "import_source"
    ADD CONSTRAINT "import_source_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
