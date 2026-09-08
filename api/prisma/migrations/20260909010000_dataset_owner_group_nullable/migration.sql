-- The owning group is required by v2, not by the schema.
--
-- @see docs/design/v2-cutover.md — What v2 requires that the schema does not
--
-- Migration 20260908010000_dataset_owner_group_required made this column NOT NULL. That
-- broke the legacy creation routes, which are the only ones that run today and which send
-- no owning group. v1 and v2 are meant to run side by side until cut-over, so a constraint
-- only v2 needs cannot sit on a column v1 writes.
--
-- The requirement moves up a layer: datasets_v2.buildDatasetCreateQuery refuses without an
-- owner_group_id, and POST /v2/datasets validates it. The column goes back to nullable so
-- legacy creation keeps working. At cut-over, once no v1 route can write a dataset, the
-- rows with no owner get assigned and the NOT NULL comes back.
--
-- The 'Unassigned Datasets' group and the backfill from that migration stay as they are.
-- Rows already moved there keep their owner; only the constraint is dropped.

ALTER TABLE "dataset" ALTER COLUMN "owner_group_id" DROP NOT NULL;
