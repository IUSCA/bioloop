-- Import sources belong to a group and have a lifecycle.
--
-- @see docs/design/groups/dataset-creation-plan.md — B1
--
-- Import sources were global: every source was listed to every user, and the browse route
-- resolved a requested path against all of them. Under groups that means one group reading
-- another group's instrument output. The source now names the group whose members may
-- browse and import from it.
--
-- The column is nullable on purpose. A source with no group stays reachable through the
-- legacy browse routes, which remain global until cut-over. The v2 routes serve only
-- sources that name a group.

CREATE TYPE "IMPORT_SOURCE_STATUS" AS ENUM ('ACTIVE', 'SUSPENDED', 'RETIRED');

ALTER TABLE "import_source"
  ADD COLUMN "owner_group_id"   TEXT,
  -- ACTIVE accepts imports. SUSPENDED is listed and refuses them, which is what an
  -- unreadable path becomes. RETIRED is neither listed nor importable.
  --
  -- A source is never deleted. Datasets imported from it still hold origin_path values
  -- underneath it, and deleting the row would lose the provenance of where they came from.
  ADD COLUMN "status"           "IMPORT_SOURCE_STATUS" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "requested_by_id"  INTEGER,
  ADD COLUMN "approved_by_id"   INTEGER,
  ADD COLUMN "approved_at"      TIMESTAMP(6),
  -- An unmounted path returns an empty listing, which a user reads as "my data is gone".
  -- A scheduled check stamps this and suspends the source instead.
  ADD COLUMN "path_verified_at" TIMESTAMP(6),
  ADD COLUMN "status_reason"    TEXT;

ALTER TABLE "import_source"
  ADD CONSTRAINT "import_source_owner_group_id_fkey"
    FOREIGN KEY ("owner_group_id") REFERENCES "group"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "import_source_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "import_source_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "import_source_owner_group_id_idx" ON "import_source"("owner_group_id");
CREATE INDEX "import_source_status_idx" ON "import_source"("status");
