-- Every dataset has an owning group.
--
-- @see docs/design/groups/decisions.md — 2. Every dataset has an owning group
--
-- A nullable owning group means a dataset that no group governs, which falls outside the
-- ownership-based authorization path entirely. This makes the column NOT NULL. Datasets
-- that have no owner are moved into a seeded, archived system group first, because a
-- migration cannot ask a human what each row should be.

-- ---------------------------------------------------------------------------
-- 1. The quarantine group (subject row first, then group row)
--
-- Unlike the system principals, this is a real group: it owns datasets, takes part in
-- the closure table, and is listed by the ordinary group queries. It is archived so it
-- sorts out of the default listing, and it has no members, so only platform admins reach
-- it. Its contents are a list somebody works through, not a resting state.
-- ---------------------------------------------------------------------------
INSERT INTO "subject" ("id", "type")
VALUES ('ffffffff-0000-4000-8000-000000000001', 'GROUP')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "group" ("id", "name", "slug", "description", "is_archived", "archived_at",
                     "allow_user_contributions", "metadata")
VALUES ('ffffffff-0000-4000-8000-000000000001',
        'Unassigned Datasets',
        'unassigned-datasets',
        'System group holding datasets that have no owning group. Archived, and visible only to platform admins. Every dataset here needs an owner assigned.',
        true,
        CURRENT_TIMESTAMP,
        false,
        '{"type": "system"}'::jsonb)
ON CONFLICT ("id") DO NOTHING;

-- Self-edge, so the group behaves like any other group in closure-table queries.
INSERT INTO "group_closure" ("ancestor_id", "descendant_id", "depth")
VALUES ('ffffffff-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001', 0)
ON CONFLICT ("ancestor_id", "descendant_id") DO NOTHING;

-- Deleting it would strand the next batch of orphans. The RESTRICT foreign key already
-- blocks a delete while it holds datasets; this covers the moment it is empty.
CREATE OR REPLACE RULE prevent_unassigned_datasets_delete AS
  ON DELETE TO "group"
  WHERE OLD.id = 'ffffffff-0000-4000-8000-000000000001'
  DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Backfill, then constrain
-- ---------------------------------------------------------------------------
UPDATE "dataset"
SET "owner_group_id" = 'ffffffff-0000-4000-8000-000000000001'
WHERE "owner_group_id" IS NULL;

ALTER TABLE "dataset" ALTER COLUMN "owner_group_id" SET NOT NULL;
