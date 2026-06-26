-- recreate the view to ensure it reflects the latest schema changes of grant table
-- valid_from is inclusive, valid_until is exclusive
CREATE OR REPLACE VIEW valid_grants AS
SELECT *
FROM "grant" g
WHERE g.valid_from <= CURRENT_TIMESTAMP
  AND (g.valid_until IS NULL OR g.valid_until > CURRENT_TIMESTAMP)
  AND g.revoked_at IS NULL;