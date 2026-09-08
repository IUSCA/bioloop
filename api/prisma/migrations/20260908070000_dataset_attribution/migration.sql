-- Attribution: who to credit for a dataset, and who funded the work.
--
-- @see docs/design/groups/decisions.md — 13. Attribution is its own relationship
--
-- Attribution is a different relationship from governance. owner_group_id says who decides
-- access and nothing else, and decision 8 made keeping the two apart a standing requirement.
-- Until now the only place this information could live was the metadata column, where nothing
-- can query it.
--
-- No policy, filter, or grant check reads these tables. Adding an affiliation must not widen
-- who can reach a dataset.
--
-- "Award" rather than "grant" throughout, because `grant` already names an authorization
-- grant everywhere else in this schema.

CREATE TABLE "dataset_funding" (
    "id"         TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "dataset_id" INTEGER NOT NULL,
    -- The funding body as it should appear in a citation.
    "funder"     TEXT NOT NULL,
    -- The award identifier within that body. Null when funding is acknowledged without one.
    "award_number" TEXT,
    "note"       TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_funding_pkey" PRIMARY KEY ("id")
);

-- One row per award per dataset. Two partial indexes rather than one three-column index,
-- because Postgres treats every NULL as distinct and the same funder acknowledged without an
-- award number could otherwise be recorded any number of times. NULLS NOT DISTINCT would say
-- this in one line and needs Postgres 15; this database is 14.
--
-- Declared here only. Prisma does not model a partial unique index, and the restriction table
-- keeps its two the same way, so leaving them out of schema.prisma avoids permanent drift.
CREATE UNIQUE INDEX "dataset_funding_dataset_funder_award_key"
    ON "dataset_funding"("dataset_id", "funder", "award_number")
    WHERE "award_number" IS NOT NULL;

CREATE UNIQUE INDEX "dataset_funding_dataset_funder_no_award_key"
    ON "dataset_funding"("dataset_id", "funder")
    WHERE "award_number" IS NULL;

-- Answering "what has this funder paid for?" across the platform.
CREATE INDEX "dataset_funding_funder_idx" ON "dataset_funding"("funder");

ALTER TABLE "dataset_funding" ADD CONSTRAINT "dataset_funding_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dataset_affiliation" (
    "id"           TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "dataset_id"   INTEGER NOT NULL,
    -- A group on this platform. Mutually exclusive with organization.
    "group_id"     TEXT,
    -- An organisation with no presence here. Mutually exclusive with group_id.
    "organization" TEXT,
    -- What the affiliation is. Free text on purpose: contribution taxonomies are a research
    -- question, not a schema decision.
    "role"         TEXT,
    "created_at"   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_affiliation_pkey" PRIMARY KEY ("id"),
    -- Exactly one of the two, the same shape the restriction table uses for group-or-resource.
    CONSTRAINT "dataset_affiliation_group_xor_organization" CHECK (
        ("group_id" IS NOT NULL AND "organization" IS NULL)
            OR ("group_id" IS NULL AND "organization" IS NOT NULL)
        )
);

CREATE INDEX "dataset_affiliation_dataset_id_idx" ON "dataset_affiliation"("dataset_id");
CREATE INDEX "dataset_affiliation_group_id_idx" ON "dataset_affiliation"("group_id");

ALTER TABLE "dataset_affiliation" ADD CONSTRAINT "dataset_affiliation_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataset_affiliation" ADD CONSTRAINT "dataset_affiliation_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
