-- Profiles for groups and collections.
--
-- Every column here is informational. Nothing in this migration changes who may read data.
-- profile_visibility decides who may read the profile itself, and defaults to PRIVATE so
-- every existing row stays private until an admin deliberately publishes it.
--
-- @see docs/design/groups/implementation/profiles.md — Schema

-- CreateEnum
CREATE TYPE "PROFILE_VISIBILITY" AS ENUM ('PRIVATE', 'AUTHENTICATED', 'PUBLIC');

-- AlterTable
ALTER TABLE "group"
  ADD COLUMN "tagline"            VARCHAR(120),
  ADD COLUMN "about_md"           TEXT,
  ADD COLUMN "avatar_key"         TEXT,
  ADD COLUMN "profile_visibility" "PROFILE_VISIBILITY" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "collection"
  ADD COLUMN "tagline"            VARCHAR(120),
  ADD COLUMN "about_md"           TEXT,
  ADD COLUMN "profile_visibility" "PROFILE_VISIBILITY" NOT NULL DEFAULT 'PRIVATE';

-- A tagline is one line under the name. Prisma expresses the length as @db.VarChar(120),
-- which Postgres enforces, but it cannot express "not only whitespace"; that check lives
-- here so an empty-looking tagline cannot be stored as a non-null value.
ALTER TABLE "group"
  ADD CONSTRAINT "group_tagline_not_blank"
  CHECK ("tagline" IS NULL OR btrim("tagline") <> '');

ALTER TABLE "collection"
  ADD CONSTRAINT "collection_tagline_not_blank"
  CHECK ("tagline" IS NULL OR btrim("tagline") <> '');

-- Listing public profiles is the one query that filters on visibility alone.
CREATE INDEX "group_profile_visibility_idx"      ON "group" ("profile_visibility");
CREATE INDEX "collection_profile_visibility_idx" ON "collection" ("profile_visibility");
