const { randomUUID } = require('crypto');
const { SVC_TASKS_SUBJECT_ID, SVC_TASKS_USER_ID } = require('@/constants');

const SVC_TASKS_USERNAME = 'svc_tasks';
const SVC_TASKS_EMAIL = 'svc_tasks@iu.edu';

/**
 * Raised when the database holds a row that blocks the service account and a human has to
 * decide what to do about it. Seeding stops rather than guessing.
 */
class SystemAccountError extends Error {}

/**
 * Point the user identity sequence past the highest id present.
 *
 * A row inserted with an explicit id does not advance the sequence, so the next generated
 * user would collide with it.
 */
async function realignUserSequence(prisma) {
  await prisma.$executeRawUnsafe(
    'SELECT setval(pg_get_serial_sequence(\'"user"\', \'id\'), '
    + 'GREATEST((SELECT COALESCE(MAX(id), 1) FROM "user"), 1))',
  );
}

/**
 * Decide which subject id a new svc_tasks row should take.
 *
 * The pinned id is used when it is free. It is also reused when a subject row already sits
 * there with no user pointing at it, which is the orphan an older version of this function
 * left behind: it inserted the subject unconditionally while declining to touch an existing
 * user row. Reusing it repairs that state instead of accumulating another.
 *
 * A pinned subject that some other user already owns forces a generated id.
 */
async function chooseSubjectId(prisma) {
  const pinned = await prisma.subject.findUnique({
    where: { id: SVC_TASKS_SUBJECT_ID },
    select: { user: { select: { username: true } } },
  });

  if (!pinned) return { subject_id: SVC_TASKS_SUBJECT_ID, insertSubject: true };
  if (!pinned.user) return { subject_id: SVC_TASKS_SUBJECT_ID, insertSubject: false };
  return { subject_id: randomUUID(), insertSubject: true };
}

/**
 * Create the svc_tasks service account, at its pinned ids where the database allows it.
 *
 * The workers authenticate with a never-expiring APP_API_TOKEN that carries the account's
 * `id` and `subject_id` as claims, and nothing reissues that token automatically. A seed run
 * that handed svc_tasks a *new* identity would silently break every unattended write, which
 * surfaces as a foreign key violation on `grant.granted_by` — that column points at
 * `user.subject_id`. So the ids are pinned, and an account that already exists is adopted
 * exactly as it is rather than renumbered.
 *
 * Three states are possible and all three are handled.
 *
 * The account is absent and both pinned ids are free. It is created at them. This is every
 * fresh database.
 *
 * The account is present. It is adopted, whatever its ids, because renumbering `user.id`
 * would have to cascade through every table that references it. Nothing at runtime reads the
 * pinned constants: `issue_token.js`, `grants/issue.js`, the seed, and the backfill migration
 * all resolve the account by username. The return value says whether the ids match, so a
 * caller can report the difference.
 *
 * The account is absent but a pinned id is taken by something else — typically a deployment
 * whose first administrator holds `user.id` 1. A generated id is used and reported. This is
 * the case the previous `ON CONFLICT ("username") DO NOTHING` form could not survive: a
 * conflict target suppresses violations of that one index, so a `user_pkey` collision was
 * raised rather than skipped.
 *
 * `email` and `cas_id` are different: both are unique, both are part of what identifies the
 * account to an operator, and a row holding one of them under another username is a
 * collision a person has to resolve. That refuses.
 *
 * Raw SQL for the insert, because the Prisma client omits an autoincrement primary key from
 * its create input, so `id` cannot be supplied through `user.create`.
 *
 * Call after roles are seeded: the row takes role_id 1.
 *
 * @see .claude/skills/workers-dev/SKILL.md — Environment
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{user_id: number, subject_id: string, created: boolean, pinned: boolean}>}
 */
async function ensureSvcTasksAccount(prisma) {
  const existing = await prisma.user.findUnique({
    where: { username: SVC_TASKS_USERNAME },
    select: { id: true, subject_id: true },
  });

  if (existing) {
    await prisma.$executeRaw`
      INSERT INTO "user_role" ("user_id", "role_id")
      VALUES (${existing.id}, 1)
      ON CONFLICT DO NOTHING
    `;
    await realignUserSequence(prisma);

    return {
      user_id: existing.id,
      subject_id: existing.subject_id,
      created: false,
      pinned: existing.id === SVC_TASKS_USER_ID && existing.subject_id === SVC_TASKS_SUBJECT_ID,
    };
  }

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email: SVC_TASKS_EMAIL }, { cas_id: SVC_TASKS_USERNAME }] },
    select: {
      id: true, username: true, email: true, cas_id: true,
    },
  });
  if (clash) {
    throw new SystemAccountError(
      `Cannot create the ${SVC_TASKS_USERNAME} service account: user "${clash.username}" `
      + `(id ${clash.id}) already holds email "${clash.email}" or cas_id "${clash.cas_id}". `
      + 'Rename or remove that user, then seed again.',
    );
  }

  const { subject_id, insertSubject } = await chooseSubjectId(prisma);

  const pinnedIdHolder = await prisma.user.findUnique({
    where: { id: SVC_TASKS_USER_ID },
    select: { id: true },
  });
  const user_id = pinnedIdHolder ? null : SVC_TASKS_USER_ID;

  if (insertSubject) {
    await prisma.$executeRaw`
      INSERT INTO "subject" ("id", "type") VALUES (${subject_id}, 'USER')
    `;
  }

  if (user_id === null) {
    // The sequence has to be sound before it hands out an id, because an earlier explicit
    // insert anywhere may have left it behind the highest id present.
    await realignUserSequence(prisma);
    await prisma.$executeRaw`
      INSERT INTO "user" ("username", "email", "cas_id", "name", "subject_id")
      VALUES (${SVC_TASKS_USERNAME}, ${SVC_TASKS_EMAIL}, ${SVC_TASKS_USERNAME},
              ${SVC_TASKS_USERNAME}, ${subject_id})
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "user" ("id", "username", "email", "cas_id", "name", "subject_id")
      VALUES (${user_id}, ${SVC_TASKS_USERNAME}, ${SVC_TASKS_EMAIL}, ${SVC_TASKS_USERNAME},
              ${SVC_TASKS_USERNAME}, ${subject_id})
    `;
  }

  const created = await prisma.user.findUniqueOrThrow({
    where: { username: SVC_TASKS_USERNAME },
    select: { id: true, subject_id: true },
  });

  await prisma.$executeRaw`
    INSERT INTO "user_role" ("user_id", "role_id")
    VALUES (${created.id}, 1)
    ON CONFLICT DO NOTHING
  `;
  await realignUserSequence(prisma);

  return {
    user_id: created.id,
    subject_id: created.subject_id,
    created: true,
    pinned: created.id === SVC_TASKS_USER_ID && created.subject_id === SVC_TASKS_SUBJECT_ID,
  };
}

module.exports = {
  ensureSvcTasksAccount,
  SystemAccountError,
  // Exported for tests: the orphan-subject branch cannot be reached on a shared development
  // database without repointing a user.subject_id that live grants reference.
  chooseSubjectId,
  SVC_TASKS_USERNAME,
  SVC_TASKS_EMAIL,
};
