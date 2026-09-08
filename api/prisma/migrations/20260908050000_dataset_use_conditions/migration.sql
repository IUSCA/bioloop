-- Consent codes, captured and not enforced.
--
-- @see docs/design/groups/decisions.md — 9. Consent codes are captured, not enforced
--
-- The conditions donors consented to are recorded on a consent form at collection time,
-- near the people who ran the study, and that information decays as staff turn over and
-- studies close. Capturing it at ingest is a metadata field. Reconstructing it later means
-- going through institutional review paperwork study by study.
--
-- Nothing reads these rows for an authorization decision, by decision rather than by
-- omission. Whether Bioloop ever exchanges access decisions with another institution under
-- GA4GH Passports is undecided and does not need deciding for this table to earn its place.

CREATE TABLE "dataset_use_condition" (
    "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "dataset_id"  INTEGER NOT NULL,
    -- The vocabulary a code belongs to, so a code is machine-readable without this schema
    -- knowing any particular ontology. The intended value is 'DUO', the GA4GH Data Use
    -- Ontology. No vocabulary is seeded, so nothing checks that a code exists in the
    -- system it names.
    "system"      TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    -- The human-readable term as recorded, so the row still means something if the
    -- vocabulary moves or the code is retired.
    "label"       TEXT,
    -- Free text from the consent form that the code does not capture.
    "note"        TEXT,
    "recorded_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" TEXT,

    CONSTRAINT "dataset_use_condition_pkey" PRIMARY KEY ("id")
);

-- One row per code per dataset. Recording the same condition twice is a mistake, not a
-- second fact.
CREATE UNIQUE INDEX "dataset_use_condition_dataset_id_system_code_key"
    ON "dataset_use_condition"("dataset_id", "system", "code");

-- Answering "which datasets carry this condition?" is the query this table exists for.
CREATE INDEX "dataset_use_condition_system_code_idx"
    ON "dataset_use_condition"("system", "code");

ALTER TABLE "dataset_use_condition" ADD CONSTRAINT "dataset_use_condition_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dataset_use_condition" ADD CONSTRAINT "dataset_use_condition_recorded_by_fkey"
    FOREIGN KEY ("recorded_by") REFERENCES "subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
