-- A group has no profile picture. Its identity mark is the kind icon.
--
-- The column held a filename under the avatar directory, never bytes, so dropping it strands
-- no data in the database. Any files left in that directory belong to no row once this runs
-- and can be deleted by hand.
--
-- @see docs/design/groups/profiles.md — The columns

-- AlterTable
ALTER TABLE "group" DROP COLUMN "avatar_key";
