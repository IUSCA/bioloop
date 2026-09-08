-- The owning group holds a real grant on every resource it governs.
--
-- @see docs/design/groups/decisions.md — 12. Owning-group members get a seeded grant, not structural read
--
-- Membership of the owning group confers no read by itself. Creating a dataset or a
-- collection now writes this grant in the same transaction as the resource. This backfill
-- gives the same row to resources that predate the rule, so the rule holds everywhere
-- rather than only going forward.
--
-- File listing is the read plane, per decision 7, so DATASET:LIST_FILES is what "the owning
-- group can read" means. It satisfies DATASET:VIEW_METADATA through the access-type closure
-- without a second row. Downloading stays a deliberate grant.
--
-- grant_access_type is populated by prisma/seed.js, which runs after migrations. On a fresh
-- database both it and the resource tables are empty, so these statements insert nothing and
-- there is nothing to insert. The seed writes the same rows for the resources it creates.

-- Datasets.
-- granted_by is NOT NULL and points at a user, and a backfill has no human actor. The
-- svc_tasks service account is the granter, which says plainly that the system issued these
-- rather than attributing them to a person who did not act. It is created by both
-- prisma/seed.js and src/scripts/init_prod_users.js, so it exists in every environment; the
-- join means a database without it is skipped rather than failed.
--
-- grant.id carries a Prisma client-side default rather than a database one, so a plain
-- SQL insert has to supply it.
INSERT INTO "grant" (
    "id", "subject_id", "resource_id", "access_type_id", "creation_type",
    "valid_from", "granted_by", "issuing_authority_id", "justification"
)
SELECT (gen_random_uuid())::text,
       d."owner_group_id",
       d."resource_id",
       gat."id",
       'SYSTEM_BOOTSTRAP'::"GRANT_CREATION_TYPE",
       CURRENT_TIMESTAMP,
       svc."subject_id",
       d."owner_group_id",
       'Seeded at creation: the owning group reads what it governs'
FROM "dataset" d
         JOIN "grant_access_type" gat ON gat."name" = 'DATASET:LIST_FILES'
         JOIN "user" svc ON svc."username" = 'svc_tasks'
WHERE d."is_deleted" = false
  -- Skip a resource that already carries this grant, so re-running is harmless and the
  -- grant_no_overlap exclusion constraint is never tripped.
  AND NOT EXISTS (SELECT 1
                  FROM "grant" g
                  WHERE g."resource_id" = d."resource_id"
                    AND g."subject_id" = d."owner_group_id"
                    AND g."access_type_id" = gat."id"
                    AND g."revoked_at" IS NULL);

-- Collections. collection.id is the resource id.
INSERT INTO "grant" (
    "id", "subject_id", "resource_id", "access_type_id", "creation_type",
    "valid_from", "granted_by", "issuing_authority_id", "justification"
)
SELECT (gen_random_uuid())::text,
       c."owner_group_id",
       c."id",
       gat."id",
       'SYSTEM_BOOTSTRAP'::"GRANT_CREATION_TYPE",
       CURRENT_TIMESTAMP,
       svc."subject_id",
       c."owner_group_id",
       'Seeded at creation: the owning group reads what it governs'
FROM "collection" c
         JOIN "grant_access_type" gat ON gat."name" = 'COLLECTION:LIST_CONTENTS'
         JOIN "user" svc ON svc."username" = 'svc_tasks'
WHERE NOT EXISTS (SELECT 1
                  FROM "grant" g
                  WHERE g."resource_id" = c."id"
                    AND g."subject_id" = c."owner_group_id"
                    AND g."access_type_id" = gat."id"
                    AND g."revoked_at" IS NULL);
