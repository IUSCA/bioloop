-- Dataset names are unique among live datasets in an owning group, and deleted rows keep their
-- names.
--
-- The previous key included is_deleted, so a group could hold at most one deleted row per name
-- and type. Deleting a second dataset of the same name then violated it, unless the delete path
-- renamed the row first.
--
-- Partial indexes cannot be expressed in schema.prisma, so this index lives only here.
-- @see docs/design/groups/dataset-storage.md — What group scoping changed

DROP INDEX "dataset_owner_group_id_name_type_is_deleted_key";

CREATE UNIQUE INDEX "dataset_live_name_key"
  ON "dataset"("owner_group_id", "name", "type")
  WHERE "is_deleted" = false;
