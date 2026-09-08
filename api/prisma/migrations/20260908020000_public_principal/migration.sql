-- A public principal, and `Everyone` renamed to `Authenticated Users`.
--
-- @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
--
-- `Everyone` meant every authenticated user. Once a principal for people who are not
-- logged in exists, a principal named `Everyone` that excludes the public is a trap, and
-- it appears in the grant subject picker where an admin reads it literally.
--
-- Routes still require authentication. This migration adds the row, protects it, and lets
-- grants name it. Serving pages to people who are not logged in is separate work.

-- ---------------------------------------------------------------------------
-- 1. Rename in place. The id does not change, so existing grants and audit
--    records keep resolving.
-- ---------------------------------------------------------------------------
UPDATE "group"
SET "name"        = 'Authenticated Users',
    "slug"        = 'authenticated-users',
    "description" = 'System principal representing every signed-in user. Cannot be deleted or modified.',
    "metadata"    = '{"type": "system"}'::jsonb
WHERE "id" = '00000000-0000-0000-0000-000000000000';

-- ---------------------------------------------------------------------------
-- 2. The public principal (subject row first, then group row)
--
--    The version (4) and variant (8) nibbles are set so this parses as an RFC 4122
--    UUID. Route validation uses express-validator's isUUID(), which rejects a
--    zero-filled id.
-- ---------------------------------------------------------------------------
INSERT INTO "subject" ("id", "type")
VALUES ('ffffffff-0000-4000-8000-000000000002', 'GROUP')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "group" ("id", "name", "slug", "description", "allow_user_contributions", "metadata")
VALUES ('ffffffff-0000-4000-8000-000000000002',
        'Public',
        'public',
        'System principal representing everyone, including people who are not signed in. Cannot be deleted or modified.',
        false,
        '{"type": "system"}'::jsonb)
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Both principals get the protections `Everyone` had. Neither can be deleted,
--    have members, or take part in the group hierarchy.
-- ---------------------------------------------------------------------------
DROP RULE IF EXISTS prevent_everyone_delete ON "group";

CREATE OR REPLACE RULE prevent_system_principal_delete AS
  ON DELETE TO "group"
  WHERE OLD.id IN ('00000000-0000-0000-0000-000000000000',
                   'ffffffff-0000-4000-8000-000000000002')
  DO INSTEAD NOTHING;

ALTER TABLE "group_user" DROP CONSTRAINT IF EXISTS no_everyone_members;
ALTER TABLE "group_user"
  ADD CONSTRAINT no_system_principal_members
  CHECK (group_id NOT IN ('00000000-0000-0000-0000-000000000000',
                          'ffffffff-0000-4000-8000-000000000002'));

ALTER TABLE "group_closure" DROP CONSTRAINT IF EXISTS no_everyone_hierarchy;
ALTER TABLE "group_closure"
  ADD CONSTRAINT no_system_principal_hierarchy
  CHECK (
    ancestor_id   NOT IN ('00000000-0000-0000-0000-000000000000',
                          'ffffffff-0000-4000-8000-000000000002')
    AND descendant_id NOT IN ('00000000-0000-0000-0000-000000000000',
                              'ffffffff-0000-4000-8000-000000000002')
  );
