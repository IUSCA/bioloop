-- `group.archive_key` is frozen at creation and can never be updated.
--
-- @see docs/design/groups/dataset-storage.md — Archival
--
-- The key names the directory a group's bundles live in, as `<archive>/<archive_key>/<name>.tar`.
-- It is derived from the slug once, at creation, and the slug is regenerated on every rename, so
-- an archive layout built on the slug would fragment the first time somebody renamed a group.
-- Freezing the key is what stops that.
--
-- Changing it does not orphan the bytes. `dataset.archive_path` is written once and read forever,
-- so staging and deletion still find every bundle already on tape. What it does is split the
-- layout: new bundles go to a new directory, older datasets keep an `archive_group_key` naming the
-- old one, and the group's archives then live in two places. Nothing detects that, and undoing it
-- means moving objects on tape.
--
-- The services never write the column after creation. `updateGroupMetadata` lists the columns it
-- writes and this is not among them, and all three seeds write it in the `create` branch of an
-- upsert only. That is an allowlist in one function rather than a rule, so it protects the call
-- sites that exist today and not the next one. This trigger is revalidated by every statement.
--
-- The refusal is raised as a check_violation (23514), so the API's error middleware answers it as
-- it answers every CHECK constraint. A later migration that must change a key disables the trigger
-- around its UPDATE.

CREATE OR REPLACE FUNCTION refuse_archive_key_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'group.archive_key is frozen at creation and cannot be changed (group %)', OLD.id
    USING ERRCODE = 'check_violation', CONSTRAINT = 'group_archive_key_immutable';
END;
$$ LANGUAGE plpgsql;

-- `UPDATE OF archive_key` narrows this to statements that name the column, and the `WHEN` clause
-- narrows it again to statements that actually change the value. Writing the same key back is
-- therefore allowed, which keeps an upsert whose update branch carries the whole row working.
CREATE TRIGGER group_archive_key_immutable
  BEFORE UPDATE OF archive_key ON "group"
  FOR EACH ROW
  WHEN (NEW.archive_key IS DISTINCT FROM OLD.archive_key)
  EXECUTE FUNCTION refuse_archive_key_update();
