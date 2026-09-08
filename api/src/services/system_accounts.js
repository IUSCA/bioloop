const { SVC_TASKS_SUBJECT_ID, SVC_TASKS_USER_ID } = require('@/constants');

/**
 * Create the svc_tasks service account at its pinned ids, if it is not there already.
 *
 * Both ids are fixed rather than generated. The workers authenticate with a never-expiring
 * APP_API_TOKEN that carries them as claims, and nothing reissues that token automatically,
 * so a seed run that handed svc_tasks a new identity would silently break every unattended
 * write — the failures surface as foreign key violations on grant.granted_by, which points
 * at user.subject_id.
 *
 * Raw SQL because the Prisma client omits an autoincrement primary key from its create
 * input, so `id` cannot be supplied through `user.create`. Guarded with ON CONFLICT so a
 * re-run changes nothing.
 *
 * Call after roles are seeded: the row takes role_id 1.
 *
 * @see .claude/skills/workers-dev/SKILL.md — Environment
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function ensureSvcTasksAccount(prisma) {
  await prisma.$executeRaw`
    INSERT INTO "subject" ("id", "type")
    VALUES (${SVC_TASKS_SUBJECT_ID}, 'USER')
    ON CONFLICT ("id") DO NOTHING
  `;

  await prisma.$executeRaw`
    INSERT INTO "user" ("id", "username", "email", "cas_id", "name", "subject_id")
    VALUES (${SVC_TASKS_USER_ID}, 'svc_tasks', 'svc_tasks@iu.edu', 'svc_tasks', 'svc_tasks',
            ${SVC_TASKS_SUBJECT_ID})
    ON CONFLICT ("username") DO NOTHING
  `;

  await prisma.$executeRaw`
    INSERT INTO "user_role" ("user_id", "role_id")
    VALUES (${SVC_TASKS_USER_ID}, 1)
    ON CONFLICT DO NOTHING
  `;

  // An explicit id does not advance the identity sequence, so the next generated user would
  // collide with it. Realign the sequence to the highest id actually present.
  await prisma.$executeRawUnsafe(
    'SELECT setval(pg_get_serial_sequence(\'"user"\', \'id\'), '
    + 'GREATEST((SELECT COALESCE(MAX(id), 1) FROM "user"), 1))',
  );
}

module.exports = { ensureSvcTasksAccount };
