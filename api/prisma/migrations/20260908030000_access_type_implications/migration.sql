-- The partial order over access types.
--
-- @see docs/design/groups/decisions.md — 7. Access types imply one another
--
-- Nothing stopped a grant of DATASET:DOWNLOAD without DATASET:VIEW_METADATA, which
-- describes a user who may download a dataset they cannot see. Presets hid this at issue
-- time, but a hand-issued grant sidestepped them, and editing a preset never repaired
-- grants already issued. A preset is a convention; an order is an invariant.
--
-- A row reads "implying implies implied": holding implying satisfies any check for implied.
-- Evaluation closes over the table transitively, so DOWNLOAD satisfies VIEW_METADATA
-- through LIST_FILES with no edge between them.

CREATE TABLE "grant_access_type_implication" (
    "implying_id" INTEGER NOT NULL,
    "implied_id" INTEGER NOT NULL,

    CONSTRAINT "grant_access_type_implication_pkey" PRIMARY KEY ("implying_id", "implied_id")
);

CREATE INDEX "grant_access_type_implication_implied_id_idx"
    ON "grant_access_type_implication"("implied_id");

ALTER TABLE "grant_access_type_implication"
    ADD CONSTRAINT "grant_access_type_implication_implying_id_fkey"
    FOREIGN KEY ("implying_id") REFERENCES "grant_access_type"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grant_access_type_implication"
    ADD CONSTRAINT "grant_access_type_implication_implied_id_fkey"
    FOREIGN KEY ("implied_id") REFERENCES "grant_access_type"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- An access type cannot imply itself. Longer cycles are not expressible as a constraint;
-- the closure builder refuses to start against one, and a test asserts the seeded graph
-- is acyclic.
ALTER TABLE "grant_access_type_implication"
    ADD CONSTRAINT "grant_access_type_implication_no_self_edge"
    CHECK ("implying_id" != "implied_id");

-- ---------------------------------------------------------------------------
-- The rows themselves come from the seed, not from here.
--
-- grant_access_type is populated by prisma/seed.js, which runs after migrations, so an
-- INSERT in this file would join against an empty table and quietly write nothing. The
-- order is defined as GRANT_ACCESS_TYPE_IMPLICATIONS in api/src/constants.js and seeded
-- alongside the access types it references, the same way the presets are.
-- ---------------------------------------------------------------------------
