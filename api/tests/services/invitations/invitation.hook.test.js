/**
 * invitation.hook.test.js
 *
 * The moment an account appears, the invitations that address is holding are applied.
 *
 * `services/user.js` is legacy code and does not know invitations exist. It opens a
 * transaction, creates the row, and runs whatever is registered for `USER_CREATED`. That is
 * the entire edit to it, and it is why signup, the admin endpoint, and the auto-signup branch
 * all gained the behaviour without any of the three being touched.
 *
 * @see .todo/issues/01-group-invitations.md — Phase 4
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const { INVITATION_STATUS, GROUP_MEMBER_ROLE } = require('@prisma/client');

const prisma = require('@/db');
const hooks = require('@/services/hooks');
const userService = require('@/services/user');
const groupsService = require('@/services/groups');
const invitationService = require('@/services/invitations');
const { applyInvitationsForNewUser } = require('@/services/invitations/hook');
const {
  createTestUser, createTestGroup, deleteUser, deleteGroup, activeMembership,
} = require('../helpers');

let admin;
let group;

const usersToDelete = [];
const groupsToDelete = [];
const usernamesToDelete = [];

async function clearInvitations() {
  await prisma.group_invitation.deleteMany({
    where: { OR: [{ group_id: { in: groupsToDelete } }, { invited_by: admin?.subject_id }] },
  });
}

/** Remove a user created through the real service rather than the helper. */
async function reapByUsername(username) {
  const u = await prisma.user.findUnique({ where: { username }, select: { subject_id: true } });
  if (!u) return;
  await prisma.authorization_audit.deleteMany({ where: { subject_id: u.subject_id } });
  await prisma.group_user.deleteMany({ where: { user_id: u.subject_id } });
  await prisma.group_invitation.deleteMany({ where: { invited_by: u.subject_id } });
  await prisma.user.deleteMany({ where: { username } });
}

beforeAll(async () => {
  admin = await createTestUser('_hook_admin');
  usersToDelete.push(admin.id);
  group = await createTestGroup(admin.subject_id, '_hook_group');
  groupsToDelete.push(group.id);
}, 30_000);

beforeEach(() => {
  // Every test states its own wiring. The registry is a module-level singleton, so a leftover
  // handler from one test would otherwise run inside the next.
  hooks.clear(hooks.USER_CREATED);
});

afterEach(async () => {
  hooks.clear(hooks.USER_CREATED);
  jest.restoreAllMocks();
  for (const username of usernamesToDelete.splice(0)) await reapByUsername(username);
  await clearInvitations();
});

afterAll(async () => {
  await clearInvitations();
  for (const id of [...groupsToDelete].reverse()) await deleteGroup(id).catch(() => {});
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

/** Create an account the way every real path does, and remember to clean it up. */
async function signUp(tag, email) {
  const username = `hooked_${Date.now()}_${tag}`;
  usernamesToDelete.push(username);
  return userService.createUser({
    username, name: `Hooked ${tag}`, email, roles: ['user'],
  });
}

const invite = (email, overrides = {}) => invitationService.createInvitation({
  group_id: group.id, email, invited_by: admin.subject_id, ...overrides,
});

describe('the registry itself', () => {
  test('runs handlers in the order they registered', async () => {
    const order = [];
    hooks.on(hooks.USER_CREATED, async () => { order.push('first'); });
    hooks.on(hooks.USER_CREATED, async () => { order.push('second'); });

    await hooks.run(hooks.USER_CREATED, {});
    expect(order).toEqual(['first', 'second']);
  });

  test('an event nobody listens to is not an error', async () => {
    await expect(hooks.run('nothing_listens_to_this', {})).resolves.toBeUndefined();
  });

  test('a handler that throws stops the rest and propagates', async () => {
    // The property the atomicity rests on. A handler runs inside the caller's transaction, so
    // swallowing its failure would leave an account committed with its invitations half done.
    const later = jest.fn();
    hooks.on(hooks.USER_CREATED, async () => { throw new Error('handler failed'); });
    hooks.on(hooks.USER_CREATED, later);

    await expect(hooks.run(hooks.USER_CREATED, {})).rejects.toThrow('handler failed');
    expect(later).not.toHaveBeenCalled();
  });

  test('registering something that is not a function is refused at once', () => {
    // Not at the moment it would have run, which could be days later on a rare path.
    expect(() => hooks.on(hooks.USER_CREATED, 'not a function')).toThrow(TypeError);
  });
});

describe('the wiring', () => {
  test('requiring the subscriber list registers the invitation handler', async () => {
    // The failure this guards is silence: a handler nobody registered does nothing and says
    // nothing. app.js requires this module at startup for exactly this side effect.
    // Only the subscriber module is evicted, not the registry. jest.resetModules() would
    // hand it a fresh copy of `hooks` to register against, and the assertion would read the
    // old one and always see zero.
    delete require.cache[require.resolve('@/services/hooks/subscribers')];
    hooks.clear(hooks.USER_CREATED);
    expect(hooks.count(hooks.USER_CREATED)).toBe(0);

    // eslint-disable-next-line global-require
    require('@/services/hooks/subscribers');
    expect(hooks.count(hooks.USER_CREATED)).toBe(1);
  });
});

describe('creating an account applies what the address was holding', () => {
  beforeEach(() => hooks.on(hooks.USER_CREATED, applyInvitationsForNewUser));

  test('the new user is in the group before createUser returns', async () => {
    const { invitation } = await invite('dana@university.edu', {
      role: GROUP_MEMBER_ROLE.ADMIN,
    });

    const user = await signUp('joins', 'dana@university.edu');

    const membership = await activeMembership(group.id, user.subject_id);
    expect(membership).not.toBeNull();
    expect(membership.role).toBe(GROUP_MEMBER_ROLE.ADMIN);
    const after = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(after.status).toBe(INVITATION_STATUS.ACCEPTED);
  });

  test('matches the invitation on the normalised address', async () => {
    await invite('Dana.Smith@University.EDU');
    const user = await signUp('cased', 'dana.smith@university.edu');
    expect(await activeMembership(group.id, user.subject_id)).not.toBeNull();
  });

  test('an address holding nothing creates an ordinary account', async () => {
    const user = await signUp('plain', 'nobody@university.edu');
    expect(user.username).toMatch(/^hooked_/);
    expect(await activeMembership(group.id, user.subject_id)).toBeNull();
  });

  test('several invitations apply together', async () => {
    const second = await createTestGroup(admin.subject_id, '_hook_second');
    groupsToDelete.push(second.id);
    await invite('dana@university.edu');
    await invite('dana@university.edu', { group_id: second.id });

    const user = await signUp('many', 'dana@university.edu');

    expect(await activeMembership(group.id, user.subject_id)).not.toBeNull();
    expect(await activeMembership(second.id, user.subject_id)).not.toBeNull();
  });

  test('a group archived since the invitation was sent does not fail the signup', async () => {
    const archived = await createTestGroup(admin.subject_id, '_hook_gone');
    groupsToDelete.push(archived.id);
    const { invitation: stale } = await invite('dana@university.edu', { group_id: archived.id });
    await invite('dana@university.edu');
    await groupsService.archiveGroup(archived.id, admin.subject_id);

    const user = await signUp('stale', 'dana@university.edu');

    // The account exists, the live invitation applied, and the stale one says why it did not.
    expect(user.subject_id).toBeTruthy();
    expect(await activeMembership(group.id, user.subject_id)).not.toBeNull();
    expect(await activeMembership(archived.id, user.subject_id)).toBeNull();
    const after = await prisma.group_invitation.findUnique({ where: { id: stale.id } });
    expect(after.cancellation_reason).toBe('group_archived');
  });
});

describe('the account and its memberships commit together', () => {
  test('a handler that fails leaves no account behind', async () => {
    // The reason createUser opens a transaction at all. Without it the row would be committed
    // and the invitation would not, and the person would exist outside the group they were
    // invited to with no way to notice.
    hooks.on(hooks.USER_CREATED, async () => {
      throw new Error('applying invitations blew up');
    });

    const username = `hooked_${Date.now()}_rollback`;
    await expect(userService.createUser({
      username, name: 'Rolled Back', email: 'rollback@university.edu', roles: ['user'],
    })).rejects.toThrow('applying invitations blew up');

    expect(await prisma.user.findUnique({ where: { username } })).toBeNull();
  });

  test('the subject row goes too, so no orphan is left for grants to name', async () => {
    const before = await prisma.subject.count();

    hooks.on(hooks.USER_CREATED, async () => { throw new Error('nope'); });
    await expect(signUp('orphan', 'orphan@university.edu')).rejects.toThrow('nope');

    expect(await prisma.subject.count()).toBe(before);
  });

  test('a membership written by a handler rolls back with the account', async () => {
    hooks.on(hooks.USER_CREATED, applyInvitationsForNewUser);
    hooks.on(hooks.USER_CREATED, async () => { throw new Error('later handler failed'); });
    const { invitation } = await invite('dana@university.edu');

    const username = `hooked_${Date.now()}_both`;
    await expect(userService.createUser({
      username, name: 'Both', email: 'dana@university.edu', roles: ['user'],
    })).rejects.toThrow('later handler failed');

    expect(await prisma.user.findUnique({ where: { username } })).toBeNull();
    const after = await prisma.group_invitation.findUnique({ where: { id: invitation.id } });
    expect(after.status).toBe(INVITATION_STATUS.PENDING);
  });
});

describe('every path that creates an account goes through this', () => {
  test('the three callers all reach createUser and none of them was edited', () => {
    // routes/users.js, routes/auth/signup.js and the auto-signup branch in services/auth.js
    // each call userService.createUser and nothing else. The hook is inside createUser, so
    // all three gained the behaviour without a line changing in any of them.
    // eslint-disable-next-line global-require
    const fs = require('fs');
    const callers = [
      'src/routes/users.js',
      'src/routes/auth/signup.js',
      'src/services/auth.js',
    ];
    for (const file of callers) {
      const source = fs.readFileSync(path.join(global.__basedir, file), 'utf8');
      expect(source).toMatch(/userService\.createUser\(/);
      // None of them names invitations, provisioning, or the hook registry.
      expect(source).not.toMatch(/invitation|provision|services\/hooks/i);
    }
  });
});
