-- Group invitations.
--
-- An invitation names an email address rather than a user, because the whole point is to
-- reach someone who has no account yet. The invited address lives in the row and not in the
-- token, so the server decides who a link belongs to and the token decodes to nothing.
--
-- @see docs/design/groups/invitations.md

CREATE TYPE "INVITATION_STATUS" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');

CREATE TABLE "group_invitation" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(43) NOT NULL,
    "group_id" TEXT NOT NULL,
    "invited_email" VARCHAR(254) NOT NULL,
    "role" "GROUP_MEMBER_ROLE" NOT NULL DEFAULT 'MEMBER',
    "invited_by" TEXT NOT NULL,
    "status" "INVITATION_STATUS" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "accepted_at" TIMESTAMP(6),
    "cancelled_at" TIMESTAMP(6),
    "cancellation_reason" TEXT,

    CONSTRAINT "group_invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_invitation_token_key" ON "group_invitation"("token");
CREATE INDEX "group_invitation_group_id_status_idx" ON "group_invitation"("group_id", "status");
CREATE INDEX "group_invitation_invited_email_status_idx" ON "group_invitation"("invited_email", "status");

-- At most one open invitation per (group, email). Accepted and cancelled rows accumulate
-- freely: they are the history of who was asked and what came of it. Enforced here rather
-- than in the service so that two admins inviting the same person at once cannot both win.
CREATE UNIQUE INDEX "group_invitation_pending_unique"
  ON "group_invitation" ("group_id", "invited_email")
  WHERE "status" = 'PENDING';

ALTER TABLE "group_invitation" ADD CONSTRAINT "group_invitation_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict, not SetNull: an invitation still has to say who vouched for the person.
ALTER TABLE "group_invitation" ADD CONSTRAINT "group_invitation_invited_by_fkey"
  FOREIGN KEY ("invited_by") REFERENCES "user"("subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;
