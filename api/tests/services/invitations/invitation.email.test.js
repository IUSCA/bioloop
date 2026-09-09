/**
 * invitation.email.test.js
 *
 * The invitation email: what gets queued, what the template renders, and what happens when
 * the portal URL nobody has configured is missing.
 *
 * Email only. `NotificationService` writes an in-app row as well whenever a `userId` comes
 * with the call, and there is deliberately none here — the recipient usually has no account
 * to read one.
 *
 * @see .todo/issues/01-group-invitations.md — Phase 3
 */

const fs = require('fs');
const path = require('path');
const config = require('config');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
// NotificationService pulls in the SSE manager, which opens two Redis connections at
// construction. Without closing them the process never exits.
const { sseManager } = require('@/notification/inApp/sseManager');
const notify = require('@/notification/NotificationService');
const { TYPES, QUEUE_ROUTING } = require('@/notification/types');
const handlebars = require('handlebars');
const { sendInvitationEmail, acceptUrl } = require('@/services/invitations/notify');

const invitation = (overrides = {}) => ({
  id: 'inv-1',
  token: 'a'.repeat(43),
  invited_email: 'dana@university.edu',
  role: 'MEMBER',
  ...overrides,
});

/**
 * Run a function as though `portal.base_url` were `value`.
 *
 * The config object is frozen at load, so the setting is intercepted rather than written.
 * `config.has` is intercepted too, because the notify module asks before it reads.
 */
async function withPortalUrl(value, fn) {
  const realGet = config.get.bind(config);
  const realHas = config.has.bind(config);
  const get = jest.spyOn(config, 'get')
    .mockImplementation((key) => (key === 'portal.base_url' ? value : realGet(key)));
  const has = jest.spyOn(config, 'has')
    .mockImplementation((key) => (key === 'portal.base_url' ? true : realHas(key)));
  try {
    return await fn();
  } finally {
    get.mockRestore();
    has.mockRestore();
  }
}

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await sseManager.shutdown();
  await prisma.$disconnect();
}, 30_000);

describe('the accept link', () => {
  test('carries the token and nothing else', () => withPortalUrl('https://portal.example', () => {
    expect(acceptUrl('abc123')).toBe('https://portal.example/invite?token=abc123');
  }));

  test('does not double the slash when the configured url has a trailing one', () => (
    withPortalUrl('https://portal.example/', () => {
      expect(acceptUrl('abc123')).toBe('https://portal.example/invite?token=abc123');
    })
  ));

  test('escapes a token that would otherwise break the query string', () => (
    withPortalUrl('https://portal.example', () => {
      // base64url never produces these, but the encoding is what makes that a property of
      // the alphabet rather than of the caller.
      expect(acceptUrl('a+b/c=')).toBe('https://portal.example/invite?token=a%2Bb%2Fc%3D');
    })
  ));

  test('is null when nobody has configured a portal url', () => withPortalUrl('', () => {
    expect(acceptUrl('abc123')).toBeNull();
  }));
});

describe('queueing the message', () => {
  test('sends to the invited address with the link and the group', async () => {
    const send = jest.spyOn(notify, 'sendInvite').mockResolvedValue({ id: 'job-1' });

    const queued = await withPortalUrl('https://portal.example', () => sendInvitationEmail({
      invitation: invitation(),
      groupName: 'Genomics Core',
      inviterName: 'Jane Doe',
    }));

    expect(queued).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      to: ['dana@university.edu'],
      subject: "You've been invited to join Genomics Core",
      groupName: 'Genomics Core',
      inviterName: 'Jane Doe',
      role: 'Member',
      acceptUrl: `https://portal.example/invite?token=${'a'.repeat(43)}`,
      expiresInDays: config.get('invitations.ttl_days'),
    });
  });

  test('never carries a userId, so no in-app row is written', async () => {
    // The dual write in _enqueue is gated on userId. An invited address usually has no
    // account, so there is nobody to write the row against.
    const send = jest.spyOn(notify, 'sendInvite').mockResolvedValue({ id: 'job-1' });
    await withPortalUrl('https://portal.example', () => sendInvitationEmail({
      invitation: invitation(), groupName: 'G', inviterName: 'P',
    }));
    expect(send.mock.calls[0][0]).not.toHaveProperty('userId');
  });

  test('shows the role as a person reads it, not as the enum spells it', async () => {
    const send = jest.spyOn(notify, 'sendInvite').mockResolvedValue({ id: 'job-1' });
    await withPortalUrl('https://portal.example', () => sendInvitationEmail({
      invitation: invitation({ role: 'ADMIN' }), groupName: 'G', inviterName: 'P',
    }));
    expect(send.mock.calls[0][0].role).toBe('Admin');
  });

  test('refuses to send a broken link when no portal url is configured', async () => {
    const send = jest.spyOn(notify, 'sendInvite');
    const queued = await withPortalUrl('', () => sendInvitationEmail({
      invitation: invitation(), groupName: 'G', inviterName: 'P',
    }));

    expect(queued).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  test('an unreachable queue is reported, not thrown', async () => {
    // The caller has already committed the invitation. A mail failure must not undo it.
    jest.spyOn(notify, 'sendInvite').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(withPortalUrl('https://portal.example', () => sendInvitationEmail({
      invitation: invitation(), groupName: 'G', inviterName: 'P',
    }))).resolves.toBe(false);
  });
});

describe('routing', () => {
  test('an invitation goes on the high-priority queue', () => {
    // Time-limited, and the recipient was told to expect it before it was sent.
    expect(QUEUE_ROUTING[TYPES.INVITE]).toEqual({ queueName: 'email:high', priority: 1 });
  });

  test('every type has a route, so none can be added and forgotten', () => {
    for (const type of Object.values(TYPES)) {
      expect(QUEUE_ROUTING[type]).toBeDefined();
    }
  });
});

describe('the template', () => {
  // Compiled straight from the .hbs file rather than through renderTemplate, which pulls in
  // mjml. mjml uses a dynamic import that needs --experimental-vm-modules, and turning that
  // on for the whole suite is a large change to accommodate one file. What is asserted here
  // is Handlebars' escaping, which is the security-relevant half; that the result survives
  // mjml is checked end to end against MailHog instead.
  const source = fs.readFileSync(path.join(global.__basedir, 'src/notification/templates/invite.mjml.hbs'), 'utf8');
  const render = (data) => handlebars.compile(source)(data);

  const data = {
    groupName: 'Genomics Core',
    inviterName: 'Jane Doe',
    role: 'Member',
    acceptUrl: 'https://portal.example/invite?token=abc',
    expiresInDays: 7,
  };

  test('names the group, the inviter, and carries the link', () => {
    const out = render(data);
    expect(out).toContain('Genomics Core');
    expect(out).toContain('Jane Doe');

    // The href is HTML-escaped, so the `=` arrives as `&#x3D;`. That is correct HTML and
    // every client decodes it; the alternative is a triple-stash that turns escaping off on
    // the one attribute an attacker would most like to control. Asserted in the escaped form
    // deliberately, so switching to `{{{acceptUrl}}}` fails here rather than silently.
    expect(out).toContain('href="https://portal.example/invite?token&#x3D;abc"');
  });

  test('escapes a group name that tries to smuggle in markup', () => {
    // A group admin picks the group name and can invite anyone, so the name is attacker
    // input. Handlebars escapes by default, which is why no explicit encode call exists.
    const out = render({
      ...data,
      groupName: '<a href="https://evil.example">Click here</a>',
      inviterName: '<script>alert(1)</script>',
    });

    expect(out).not.toContain('<a href="https://evil.example"');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;');
  });

  test('says how long the link lasts and that it does nothing until used', () => {
    // Collapsed, because the source wraps and the sentence spans a line break.
    const out = render(data).replace(/\s+/g, ' ');
    expect(out).toMatch(/expires in 7 days/i);
    expect(out).toMatch(/nothing happens until you accept/i);
  });

  test('the worker precompiles it, so the first invitation is not the slow one', () => {
    // preloadTemplates carries a hardcoded list. A template missing from it still renders,
    // just cold, and nothing else would notice.
    const renderer = fs.readFileSync(path.join(global.__basedir, 'src/notification/email/templateRenderer.js'), 'utf8');
    expect(renderer).toMatch(/const names = \[[^\]]*'invite'/);
  });
});
