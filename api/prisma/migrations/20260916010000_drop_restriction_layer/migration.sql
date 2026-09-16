-- Drop the restriction layer.
--
-- Archiving and deletion are resource state, not restrictions. Each resource type declares
-- which actions its state admits, in its own file under `api/src/state/builtin/`, and every
-- service asks that inside the transaction that makes the change, after its row lock. A
-- refusal is 409: the caller holds the action, and the resource does not admit it.
--
-- So nothing reads these objects any more. `is_archived` on `group` and `collection`, and
-- `is_deleted` on `dataset`, are the authority, and they always carried the state the views
-- derived. No restriction type was ever specified beyond ARCHIVED and the derived DELETED,
-- and the engine's restriction seam stays in the application for one that is.
--
-- Nothing is preserved. The `restriction` rows duplicated the archived columns row for row,
-- written in the same transaction, and `applied_by`/`lifted_by`/`reason` were never written
-- by any service or exposed by any route. Who archived a group and when survives in
-- `authorization_audit` and in `archived_at`.
--
-- @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
-- @see docs/design/groups/implementation/restrictions-plan.md — D4. The restriction tables leave until restrictions are specified

-- The views first: both read `restriction`, and `effective_restriction` reads
-- `active_restriction`.
DROP VIEW IF EXISTS "effective_restriction";
DROP VIEW IF EXISTS "active_restriction";

-- Then the table, which holds the foreign key to the type table.
DROP TABLE IF EXISTS "restriction";

-- Then the types, ARCHIVED and DELETED among them.
DROP TABLE IF EXISTS "restriction_type";
