-- The restriction layer.
--
-- @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
--
--   allowed = no restriction blocks this  AND  some grant permits it
--
-- A restriction never cancels a grant and never references one. Adding one can only narrow
-- access, and AND commutes, so the order two restrictions are applied in does not matter.
-- Negative grants were rejected: subtraction breaks the property that one grant is one
-- fact and access is their union.

CREATE TABLE "restriction_type" (
    "name"        TEXT NOT NULL,
    "description" TEXT NOT NULL,
    -- Whether a platform admin can remove a restriction of this type. A property of the
    -- type, not of the row: a future agreement-based restriction should not be liftable at
    -- all, only satisfiable.
    "liftable"    BOOLEAN NOT NULL,

    CONSTRAINT "restriction_type_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "restriction" (
    "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "type_name"   TEXT NOT NULL,
    "group_id"    TEXT,
    "resource_id" TEXT,
    "applied_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_by"  TEXT,
    "lifted_at"   TIMESTAMP(6),
    "lifted_by"   TEXT,
    "reason"      TEXT,

    CONSTRAINT "restriction_pkey" PRIMARY KEY ("id")
);

-- A restriction attaches to exactly one thing.
ALTER TABLE "restriction"
    ADD CONSTRAINT "restriction_target_is_group_xor_resource"
    CHECK (("group_id" IS NULL) != ("resource_id" IS NULL));

CREATE INDEX "restriction_group_id_lifted_at_idx"    ON "restriction"("group_id", "lifted_at");
CREATE INDEX "restriction_resource_id_lifted_at_idx" ON "restriction"("resource_id", "lifted_at");
CREATE INDEX "restriction_type_name_idx"             ON "restriction"("type_name");

-- At most one restriction of a given type in force per target, so lifting is unambiguous.
CREATE UNIQUE INDEX "restriction_one_open_per_group"
    ON "restriction"("group_id", "type_name") WHERE "lifted_at" IS NULL AND "group_id" IS NOT NULL;
CREATE UNIQUE INDEX "restriction_one_open_per_resource"
    ON "restriction"("resource_id", "type_name") WHERE "lifted_at" IS NULL AND "resource_id" IS NOT NULL;

ALTER TABLE "restriction" ADD CONSTRAINT "restriction_type_name_fkey"
    FOREIGN KEY ("type_name") REFERENCES "restriction_type"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restriction" ADD CONSTRAINT "restriction_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restriction" ADD CONSTRAINT "restriction_resource_id_fkey"
    FOREIGN KEY ("resource_id") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restriction" ADD CONSTRAINT "restriction_applied_by_fkey"
    FOREIGN KEY ("applied_by") REFERENCES "subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restriction" ADD CONSTRAINT "restriction_lifted_by_fkey"
    FOREIGN KEY ("lifted_by") REFERENCES "subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The one restriction type, seeded here rather than from seed.js because nothing
-- references it by id and the evaluation path needs it present on any database.
-- ---------------------------------------------------------------------------
INSERT INTO "restriction_type" ("name", "description", "liftable")
VALUES ('ARCHIVED',
        'The group or resource is archived. Every mutating action on it is blocked; reading is unaffected.',
        true)
ON CONFLICT ("name") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Backfill from the archived state that already exists, so the table agrees with the
-- is_archived columns from the moment it is created.
-- ---------------------------------------------------------------------------
INSERT INTO "restriction" ("type_name", "group_id", "applied_at")
SELECT 'ARCHIVED', g.id, COALESCE(g.archived_at, CURRENT_TIMESTAMP)
FROM "group" g
WHERE g.is_archived = true;

INSERT INTO "restriction" ("type_name", "resource_id", "applied_at")
SELECT 'ARCHIVED', c.id, COALESCE(c.archived_at, CURRENT_TIMESTAMP)
FROM "collection" c
WHERE c.is_archived = true;

-- ---------------------------------------------------------------------------
-- Where a restriction reaches.
--
-- A restriction on a group applies to the group itself, to every descendant group, and to
-- the datasets and collections those groups govern. A restriction on a resource applies to
-- that resource alone. Both shapes are unioned into one view so the evaluation path has a
-- single thing to query.
--
-- group_id is the group the restriction lands on, resource_id the resource it lands on;
-- exactly one is set per row, the same way it is on the restriction itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW active_restriction AS
SELECT id, type_name, group_id, resource_id, applied_at, applied_by, reason
FROM "restriction"
WHERE lifted_at IS NULL;

CREATE OR REPLACE VIEW effective_restriction AS
-- The restricted group, and every group beneath it.
SELECT
    gc.descendant_id AS group_id,
    NULL::text       AS resource_id,
    r.type_name,
    r.id             AS restriction_id,
    r.group_id       AS origin_group_id
FROM active_restriction r
JOIN "group_closure" gc ON gc.ancestor_id = r.group_id
WHERE r.group_id IS NOT NULL

UNION ALL

-- The datasets those groups govern.
SELECT
    NULL::text AS group_id,
    d.resource_id,
    r.type_name,
    r.id       AS restriction_id,
    r.group_id AS origin_group_id
FROM active_restriction r
JOIN "group_closure" gc ON gc.ancestor_id = r.group_id
JOIN "dataset" d ON d.owner_group_id = gc.descendant_id
WHERE r.group_id IS NOT NULL

UNION ALL

-- The collections those groups govern.
SELECT
    NULL::text AS group_id,
    c.id       AS resource_id,
    r.type_name,
    r.id       AS restriction_id,
    r.group_id AS origin_group_id
FROM active_restriction r
JOIN "group_closure" gc ON gc.ancestor_id = r.group_id
JOIN "collection" c ON c.owner_group_id = gc.descendant_id
WHERE r.group_id IS NOT NULL

UNION ALL

-- Restrictions attached straight to a resource.
SELECT
    NULL::text  AS group_id,
    r.resource_id,
    r.type_name,
    r.id        AS restriction_id,
    NULL::text  AS origin_group_id
FROM active_restriction r
WHERE r.resource_id IS NOT NULL;
