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
const { ensureSvcTasksAccount } = require('@/services/system_accounts');

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
