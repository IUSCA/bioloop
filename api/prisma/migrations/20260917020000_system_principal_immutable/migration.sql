-- The system principal rows cannot be modified.
--
-- @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
--
-- `Authenticated Users` and `Public` are identified by their fixed ids, and their names are what an
-- admin reads in the grant subject picker. Nobody governs either one, so no edit, archive, or
-- profile change to them is anyone's to make.
--
-- The refusal is raised as a check_violation (23514), so the API's error middleware answers it as
-- it answers every CHECK constraint. A later migration that must change one of these rows disables
-- the trigger around its UPDATE.
--
-- Deleting either row is already absorbed by the rule `prevent_system_principal_delete`.

CREATE OR REPLACE FUNCTION refuse_system_principal_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'system principal % cannot be modified', OLD.id
    USING ERRCODE = 'check_violation', CONSTRAINT = 'system_principal_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER system_principal_immutable
  BEFORE UPDATE ON "group"
  FOR EACH ROW
  WHEN (OLD.id IN ('00000000-0000-0000-0000-000000000000',
                   'ffffffff-0000-4000-8000-000000000002'))
  EXECUTE FUNCTION refuse_system_principal_update();
