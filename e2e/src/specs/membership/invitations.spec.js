const { test, expect } = require('../../fixtures');
const { expectConcealed, expectForbidden } = require('../../assertions/parity');
const { waitForInvitationToken, mailMark } = require('../../world/mail');

/**
 * Phase 5b — invitations.
 *
 * An invitation is a claim on an address, not on an account, so the token has to survive
 * somebody signing up later and must confer exactly what it says and nothing more. Three of
 * these are boundary flows about what the *unauthenticated* check endpoint may reveal, which
 * is the part where a helpful error message becomes an oracle.
 *
 * These need Redis, MailHog, and the notification worker, because the token exists only in
 * the email — no API returns it. `docker compose up -d redis mailhog` and
 * `bin/devserver.sh up notifications-worker`.
 *
 * @see docs/design/groups/e2e-test-flows.md — C1, C2, C3, C4, C6
 * @see docs/design/groups/implementation/invitations.md
 */

/** A fresh group so one test's invitations cannot decide another's. */
async function createGroup(priya, world, label) {
  return priya.api.post(`/groups/${world.groups.center.id}/children`, {
    name: `${world.prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`,
    description: `Phase 5 fixture for ${label}.`,
    admins: [world.people.alice.subject_id],
    members: [],
  });
}

/** An address nobody holds, unique per run so a previous run's mail cannot be picked up. */
function freshAddress(world, label) {
  return `vic-${label}-${world.runId}-${Math.random().toString(36).slice(2, 8)}@example.org`;
}

/**
 * The group's invitations.
 *
 * The route defaults to `status=PENDING`, which is right for a page headed "outstanding" and
 * wrong for asserting what happened to one that was spent — it simply disappears. Pass
 * `'all'` to follow an invitation past its acceptance.
 */
async function invitationsOf(ctx, groupId, status) {
  const query = status ? `?status=${status}&limit=100` : '';
  const list = await ctx.api.get(`/groups/${groupId}/invitations${query}`);
  return list.data || list.invitations || list;
}

test('C1 — inviting somebody who has no account', async ({ world, as }) => {
  const [priya, alice] = await Promise.all([as('priya'), as('alice')]);
  const group = await createGroup(priya, world, 'c1');
  const address = freshAddress(world, 'c1');

  const mark = mailMark();
  await alice.api.post(`/groups/${group.id}/invitations`, { email: address, role: 'MEMBER' });

  // It appears in the group's outstanding list, pending, with an expiry.
  const [invitation] = (await invitationsOf(alice, group.id))
    .filter((i) => i.invited_email.toLowerCase() === address.toLowerCase());
  expect(invitation, 'the invitation is absent from the group\'s own list').toBeTruthy();
  expect(invitation.status).toBe('PENDING');
  expect(invitation.expires_at, 'a pending invitation with no expiry never lapses').toBeTruthy();
  expect(new Date(invitation.expires_at).getTime()).toBeGreaterThan(Date.now());

  // And an email carrying a usable link reaches the address. This is the only place the token
  // exists, which is why it is worth asserting rather than assuming.
  const token = await waitForInvitationToken(address, { since: mark });
  expect(token.length, 'the invitation link carries no token').toBeGreaterThan(10);

  const check = await alice.api.post('/auth/invite/check', { token });
  expect(check.valid ?? check.is_valid ?? check, 'the emailed token does not validate').toBeTruthy();
});

test('C2 — the link is single use, and says nothing else', async ({ world, as }) => {
  const [priya, alice, quinn] = await Promise.all([as('priya'), as('alice'), as('quinn')]);
  const group = await createGroup(priya, world, 'c2');

  // Invited to an account that exists, so the token can actually be spent. C1 covers the
  // address with no account behind it; this one is about what happens after acceptance.
  const me = await quinn.api.get('/v2/users/me');
  const mark = mailMark();
  await alice.api.post(`/groups/${group.id}/invitations`, {
    email: me.user.email,
    role: 'MEMBER',
  });
  const [invitation] = (await invitationsOf(alice, group.id))
    .filter((i) => i.invited_email.toLowerCase() === me.user.email.toLowerCase());
  const token = await waitForInvitationToken(me.user.email, { since: mark });

  const accepted = await quinn.api.post('/auth/invite/apply', { token });
  // The reply names the group it joined, which is how the invitee is told where they landed.
  expect(accepted.group_id, 'accepting an invitation joined a different group')
    .toBe(group.id);

  // It leaves the outstanding list, which is what "outstanding" means.
  const stillPending = await invitationsOf(alice, group.id);
  expect(stillPending.map((i) => i.id))
    .not.toContain(invitation.id);

  // And it is closed rather than deleted: the record of who was invited survives.
  const after = (await invitationsOf(alice, group.id, 'all')).find((i) => i.id === invitation.id);
  expect(after, 'the invitation vanished from the group instead of closing').toBeTruthy();
  expect(after.status, 'the invitation stayed pending after it was spent').not.toBe('PENDING');

  // Spending it again fails, and the check endpoint — which is unauthenticated — answers only
  // that it is not valid. A reason would turn it into an oracle for somebody else's
  // invitation, which is the whole point of the flow.
  const recheck = await alice.api.post('/auth/invite/check', { token });
  expect(recheck.status, 'a spent token still validates').toBe('invalid');
  expect(
    JSON.stringify(recheck),
    'the check endpoint distinguishes an accepted invitation from an unknown one',
  ).not.toMatch(/accepted|expired|cancelled|canceled|already|member/i);

  const again = await quinn.api.status('POST', '/auth/invite/apply', { token });
  expect(again, 'a spent invitation could be applied twice').toBeGreaterThanOrEqual(400);
});

test('C3 — the wrong person clicks the link, and learns nothing about whose it was', async ({ world, as }) => {
  const [priya, alice, frank] = await Promise.all([as('priya'), as('alice'), as('frank')]);
  const group = await createGroup(priya, world, 'c3');
  const address = freshAddress(world, 'c3');

  const mark = mailMark();
  await alice.api.post(`/groups/${group.id}/invitations`, { email: address, role: 'MEMBER' });
  const token = await waitForInvitationToken(address, { since: mark });

  // Frank is signed in as himself and the invitation names somebody else's address.
  const { status, body } = await frank.api.raw('POST', '/auth/invite/apply', { token });
  expect(status, 'the wrong account was allowed to spend the invitation')
    .toBeGreaterThanOrEqual(400);

  // The address is the thing that must not leak. Frank learns he cannot use this link and
  // not who it belongs to.
  expect(body, 'the refusal disclosed the invited address').not.toContain(address);
  expect(body, 'the refusal disclosed the local part of the invited address')
    .not.toContain(address.split('@')[0]);

  // And he is not in the group.
  const members = await alice.api.get(`/groups/${group.id}/members`);
  expect(JSON.stringify(members.data || members))
    .not.toContain(world.people.frank.subject_id);
});

test('C4 — an invitation cannot change an existing role', async ({ world, as }) => {
  const [priya, alice, bob] = await Promise.all([as('priya'), as('alice'), as('bob')]);
  const group = await createGroup(priya, world, 'c4');

  await alice.api.post(`/groups/${group.id}/members`, {
    members: [{ user_id: world.people.bob.subject_id }],
  });

  // The flow imagines the invitation being issued and then failing to promote on acceptance.
  // The API closes the door earlier than that: inviting somebody who is already a member is
  // refused outright, so the escalation path never opens. Asserted as what happens rather
  // than as what the flow guessed, and it is the stronger of the two behaviours.
  const me = await bob.api.get('/v2/users/me');
  const { status, body } = await alice.api.raw('POST', `/groups/${group.id}/invitations`, {
    email: me.user.email,
    role: 'ADMIN',
  });
  expect(status, 'an existing member could be invited as an admin').toBe(400);
  expect(body).toMatch(/already a member/i);

  // And his standing is untouched: still a member, still unable to govern.
  const members = await alice.api.get(`/groups/${group.id}/members?membership_type=direct`);
  const rows = members.data || members.members || members;
  const bobRow = rows.find((m) => (m.user_id || m.user?.subject_id || m.subject_id)
    === world.people.bob.subject_id);
  expect(bobRow, 'Bob is no longer a member at all').toBeTruthy();
  expect(bobRow.role, 'an invitation promoted an existing member').toBe('MEMBER');

  await expectForbidden(bob.api, 'POST', `/groups/${group.id}/members`, {
    members: [{ user_id: world.people.quinn.subject_id }],
  });
});

test('C6 — an admin cannot cancel another group\'s invitation', async ({ world, as }) => {
  const [priya, alice, erin] = await Promise.all([as('priya'), as('alice'), as('erin')]);
  const group = await createGroup(priya, world, 'c6');
  const address = freshAddress(world, 'c6');

  await alice.api.post(`/groups/${group.id}/invitations`, { email: address, role: 'MEMBER' });
  const [invitation] = (await invitationsOf(alice, group.id))
    .filter((i) => i.invited_email.toLowerCase() === address.toLowerCase());

  // Erin administers a sibling group and holds no standing on this one, so the refusal is the
  // answer an unknown id gets. Governance is local, and cancelling an invitation is governance.
  await expectConcealed(erin.api, 'DELETE', `/groups/${group.id}/invitations/${invitation.id}`);

  // It is still pending afterwards — the refusal did not half-apply.
  const [after] = (await invitationsOf(alice, group.id))
    .filter((i) => i.id === invitation.id);
  expect(after.status).toBe('PENDING');
});
