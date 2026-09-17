-- The system principals own nothing, contribute nothing, are credited with nothing, and hold no
-- authority over a grant.
--
-- @see docs/design/groups/decisions.md — 3. A public principal exists, and `Everyone` is renamed
--
-- `Authenticated Users` and `Public` are grant subjects. They have no members and no place in
-- the hierarchy (`no_system_principal_members`, `no_system_principal_hierarchy`), so no person
-- governs them. A row naming one as an owner, a contributing group, an affiliation, or a
-- grant's authority names a group nobody can act for.
--
-- A NULL passes a CHECK, so the nullable columns keep admitting "no group".

ALTER TABLE "dataset"
  ADD CONSTRAINT dataset_owner_not_system_principal
  CHECK (owner_group_id NOT IN ('00000000-0000-0000-0000-000000000000',
                                'ffffffff-0000-4000-8000-000000000002'));

ALTER TABLE "collection"
  ADD CONSTRAINT collection_owner_not_system_principal
  CHECK (owner_group_id NOT IN ('00000000-0000-0000-0000-000000000000',
                                'ffffffff-0000-4000-8000-000000000002'));

ALTER TABLE "import_source"
  ADD CONSTRAINT import_source_owner_not_system_principal
  CHECK (owner_group_id NOT IN ('00000000-0000-0000-0000-000000000000',
                                'ffffffff-0000-4000-8000-000000000002'));

ALTER TABLE "user_dataset_contribution"
  ADD CONSTRAINT user_dataset_contribution_group_not_system_principal
  CHECK (group_id NOT IN ('00000000-0000-0000-0000-000000000000',
                          'ffffffff-0000-4000-8000-000000000002'));

ALTER TABLE "dataset_affiliation"
  ADD CONSTRAINT dataset_affiliation_group_not_system_principal
  CHECK (group_id NOT IN ('00000000-0000-0000-0000-000000000000',
                          'ffffffff-0000-4000-8000-000000000002'));

ALTER TABLE "grant"
  ADD CONSTRAINT grant_authority_not_system_principal
  CHECK (
    issuing_authority_id  NOT IN ('00000000-0000-0000-0000-000000000000',
                                  'ffffffff-0000-4000-8000-000000000002')
    AND revoking_authority_id NOT IN ('00000000-0000-0000-0000-000000000000',
                                      'ffffffff-0000-4000-8000-000000000002')
  );
