-- A soft-deleted dataset carries the DELETED restriction for as long as it stays deleted.
-- The restriction is read from the dataset row, not written as a restriction row, so every
-- path that sets is_deleted is covered without writing to the restriction table.
-- @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 4

INSERT INTO "restriction_type" ("name", "description", "liftable")
VALUES ('DELETED', 'The dataset is soft-deleted: its record stays readable, and its bytes are gone.', false)
ON CONFLICT ("name") DO NOTHING;

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
WHERE r.resource_id IS NOT NULL

UNION ALL

-- Soft-deleted datasets.
SELECT
    NULL::text      AS group_id,
    d.resource_id,
    'DELETED'::text AS type_name,
    NULL::text      AS restriction_id,
    NULL::text      AS origin_group_id
FROM "dataset" d
WHERE d.is_deleted;
