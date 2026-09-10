/**
 * system_accounts.test.js
 *
 * The svc_tasks service account keeps the same id and subject_id across every seed run.
 * The workers authenticate with a never-expiring APP_API_TOKEN carrying both as claims, and
 * nothing reissues it automatically, so a generated identity would silently break every
 * unattended write.
 *
 * @see api/src/services/system_accounts.js
 * @see .claude/skills/workers-dev/SKILL.md — Environment
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const validator = require('validator');
const prisma = require('@/db');
const { SVC_TASKS_USER_ID, SVC_TASKS_SUBJECT_ID } = require('@/constants');
const {
  ensureSvcTasksAccount, chooseSubjectId, SystemAccountError, SVC_TASKS_EMAIL,
  SVC_TASKS_USERNAME,
} = require('@/services/system_accounts');

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the svc_tasks service account', () => {
  test('is seeded at its pinned ids', async () => {
    const svc = await prisma.user.findUnique({
      where: { username: 'svc_tasks' },
      select: { id: true, subject_id: true },
    });

    expect(svc).not.toBeNull();
    expect(svc.id).toBe(SVC_TASKS_USER_ID);
    expect(svc.subject_id).toBe(SVC_TASKS_SUBJECT_ID);
  });

  test('has an admin role, so unattended writes are permitted', async () => {
    const roles = await prisma.user_role.findMany({
      where: { user_id: SVC_TASKS_USER_ID },
      select: { role_id: true },
    });

    expect(roles.map((r) => r.role_id)).toContain(1);
  });

  test('has a subject row, which grant.granted_by resolves against', async () => {
    // grant.granted_by is NOT NULL and its foreign key is to user.subject_id. A missing or
    // changed subject shows up as a grant_granted_by_fkey violation deep inside a create.
    const subject = await prisma.subject.findUnique({
      where: { id: SVC_TASKS_SUBJECT_ID },
      select: { type: true },
    });

    expect(subject).not.toBeNull();
    expect(subject.type).toBe('USER');
  });

  test('ensureSvcTasksAccount is idempotent', async () => {
    const before = await prisma.user.count();

    await ensureSvcTasksAccount(prisma);
    await ensureSvcTasksAccount(prisma);

    expect(await prisma.user.count()).toBe(before);
  });

  test('a new user still gets an id, so the identity sequence is aligned', async () => {
    // An explicit id does not advance the sequence. Without the setval in
    // ensureSvcTasksAccount, the next generated user collides with svc_tasks.
    const subject_id = `ffffffff-1000-4000-8000-${Date.now().toString().slice(-12)}`;
    const created = await prisma.user.create({
      data: {
        username: `_seq_check_${Date.now()}`,
        email: `_seq_check_${Date.now()}@example.invalid`,
        subject: { create: { id: subject_id, type: 'USER' } },
      },
      select: { id: true, subject_id: true },
    });

    expect(created.id).toBeGreaterThan(SVC_TASKS_USER_ID);

    await prisma.user.delete({ where: { id: created.id } });
  });

  test('the pinned subject id obeys the sentinel rules', () => {
    expect(validator.isUUID(SVC_TASKS_SUBJECT_ID)).toBe(true);
    expect(SVC_TASKS_SUBJECT_ID.startsWith('00000000')).toBe(false);
  });
});

/**
 * Run `fn` against a transaction that is always rolled back.
 *
 * The scenarios below need svc_tasks to look absent, or its ids to look taken. The row is
 * referenced by live grants through `grant.granted_by`, so it cannot be deleted, and this is
 * the shared development database. Renaming it inside a transaction that never commits gives
 * the scenario without leaving anything behind.
 *
 * `setval` is not transactional in Postgres, so the user sequence may end a run one ahead of
 * the highest id present. That is harmless: the next generated id is still unused.
 */
class Rollback extends Error {}

async function inRollback(fn) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/** Rename svc_tasks so `ensureSvcTasksAccount` cannot find it by username. */
async function parkSvcTasks(tx, { keepEmail = false } = {}) {
  await tx.user.update({
    where: { username: SVC_TASKS_USERNAME },
    data: {
      username: 'parked_svc_tasks',
      ...(keepEmail ? {} : { email: 'parked_svc_tasks@example.invalid', cas_id: 'parked_svc_tasks' }),
    },
  });
}

describe('ensureSvcTasksAccount on a database that cannot give it the pinned ids', () => {
  test('adopts the existing account rather than renumbering it', async () => {
    const result = await ensureSvcTasksAccount(prisma);

    expect(result.created).toBe(false);
    expect(result.user_id).toBe(SVC_TASKS_USER_ID);
    expect(result.subject_id).toBe(SVC_TASKS_SUBJECT_ID);
    expect(result.pinned).toBe(true);
  });

  test('creates the account at a generated id when the pinned ids are taken', async () => {
    // The realistic case: a deployment whose first administrator holds user.id 1. The old
    // ON CONFLICT ("username") form raised a user_pkey violation here instead.
    let result;
    await inRollback(async (tx) => {
      await parkSvcTasks(tx);
      result = await ensureSvcTasksAccount(tx);
    });

    expect(result.created).toBe(true);
    expect(result.pinned).toBe(false);
    expect(result.user_id).not.toBe(SVC_TASKS_USER_ID);
    expect(result.subject_id).not.toBe(SVC_TASKS_SUBJECT_ID);
    expect(validator.isUUID(result.subject_id)).toBe(true);
  });

  test('the account it creates is usable: it exists, and holds the admin role', async () => {
    let created;
    let roles;
    await inRollback(async (tx) => {
      await parkSvcTasks(tx);
      const result = await ensureSvcTasksAccount(tx);
      created = await tx.user.findUnique({
        where: { username: SVC_TASKS_USERNAME },
        select: {
          id: true, subject_id: true, email: true, cas_id: true,
        },
      });
      roles = await tx.user_role.findMany({
        where: { user_id: result.user_id },
        select: { role_id: true },
      });
    });

    expect(created).not.toBeNull();
    expect(created.email).toBe(SVC_TASKS_EMAIL);
    expect(created.cas_id).toBe(SVC_TASKS_USERNAME);
    expect(roles.map((r) => r.role_id)).toContain(1);
  });

  test('refuses when another user holds the service account email', async () => {
    // A collision a person has to resolve: unlike the id, the email is part of what
    // identifies the account to an operator, so adopting silently would be wrong.
    let error;
    await inRollback(async (tx) => {
      await parkSvcTasks(tx, { keepEmail: true });
      error = await ensureSvcTasksAccount(tx).catch((e) => e);
    });

    expect(error).toBeInstanceOf(SystemAccountError);
    expect(error.message).toMatch(/parked_svc_tasks/);
    expect(error.message).toMatch(/svc_tasks@iu\.edu/);
  });
});

describe('chooseSubjectId', () => {
  // Driven with a stub client. The orphan case cannot be built on the shared development
  // database, because freeing the pinned subject means repointing a user.subject_id that
  // live grants reference through grant.granted_by.
  const stub = (pinnedRow) => ({ subject: { findUnique: async () => pinnedRow } });

  test('takes the pinned id when nothing is there', async () => {
    expect(await chooseSubjectId(stub(null)))
      .toEqual({ subject_id: SVC_TASKS_SUBJECT_ID, insertSubject: true });
  });

  test('reuses an orphaned pinned subject rather than leaving it behind', async () => {
    // The state an earlier version of ensureSvcTasksAccount produced: it inserted the
    // subject unconditionally while declining to touch an existing user row.
    expect(await chooseSubjectId(stub({ user: null })))
      .toEqual({ subject_id: SVC_TASKS_SUBJECT_ID, insertSubject: false });
  });

  test('generates an id when another user owns the pinned subject', async () => {
    const { subject_id, insertSubject } = await chooseSubjectId(stub({ user: { username: 'someone' } }));

    expect(subject_id).not.toBe(SVC_TASKS_SUBJECT_ID);
    expect(validator.isUUID(subject_id)).toBe(true);
    expect(insertSubject).toBe(true);
  });
});
