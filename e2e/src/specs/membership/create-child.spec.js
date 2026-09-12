const { test, expect } = require('../../fixtures');

/**
 * Who governs a subgroup is the creator's choice, made in the create form.
 *
 * `POST /groups/:id/children` used to append the creator to the child's admins, which handed an
 * ancestor admin authority over every group they made. It no longer does, so the form asks. The
 * checkbox starts checked and disabled — the group needs an admin and on an empty form the
 * creator is the only candidate — and becomes a real choice as soon as the request names
 * somebody else. The creator never appears in the admin search, because the checkbox is how
 * they put themselves in.
 *
 * @see docs/design/groups/e2e-test-flows.md — A1
 */

const CREATOR_CHECKBOX = 'creator-is-admin';

/** The create-subgroup form, opened the way an admin reaches it. */
async function openCreateSubgroupForm(page, groupId) {
  await page.goto(`/v2/groups/${groupId}`);
  await expect(page.getByTestId('group-detail')).toBeVisible();
  await page.getByRole('tab', { name: /Subgroups/ }).click();
  await page.getByRole('button', { name: /Create Sub Group/i }).click();
  return page.locator('.va-modal').first();
}

/** How the admin search shows a person: their name, or their address when they have no name. */
async function displayNameOf(api, username) {
  const { users } = await api.get(`/v2/users?search=${encodeURIComponent(username)}&take=5`);
  const match = (users || []).find((u) => u.username === username);
  expect(match, `the account ${username} is not searchable`).toBeTruthy();
  return match.name || match.email;
}

/** The direct membership rows of a group, whatever the listing wraps them in. */
async function directMembers(api, groupId) {
  const res = await api.get(`/groups/${groupId}/members?membership_type=direct`);
  return res.data || res.members || res;
}

function rowFor(rows, subjectId) {
  return rows.find((m) => (m.user_id || m.subject_id || m.user?.subject_id) === subjectId);
}

test('the creator chooses whether they govern the subgroup they create', async ({ world, as }) => {
  const alice = await as('alice');
  const modal = await openCreateSubgroupForm(alice.page, world.groups.requestLab.id);

  const checkbox = modal.getByTestId(CREATOR_CHECKBOX).locator('input[type="checkbox"]');
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeDisabled();
  await expect(modal.getByText(/at least one admin is needed/i)).toBeVisible();

  const search = modal.getByPlaceholder(/search users to add as admins/i);

  // Alice cannot find herself: she is the checkbox, not a search result.
  await search.fill(alice.person.username);
  await expect(modal.getByText(/no results found/i)).toBeVisible();

  // Naming somebody else turns the checkbox into a choice, still checked until she clears it.
  const quinnLabel = await displayNameOf(alice.api, world.people.quinn.username);
  await search.fill(world.people.quinn.username);
  await modal.getByText(quinnLabel, { exact: false }).first().click();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeChecked();

  await modal.getByTestId(CREATOR_CHECKBOX).click();
  await expect(checkbox).not.toBeChecked();

  const name = `${world.prefix}-ui-child-${Math.random().toString(36).slice(2, 8)}`;
  await modal.getByPlaceholder(/Computational Genomics Lab/i).fill(name);
  await modal.getByRole('button', { name: /^Create Subgroup$/i }).click();
  await expect(modal).toBeHidden();

  // The group exists with Quinn governing it, and Alice is not in it at all. She keeps the
  // oversight that owning the parent gives her, and holds no authority inside the child.
  const found = await alice.api.get(
    `/groups/${world.groups.requestLab.id}/descendants?max_depth=1`
    + `&search_term=${encodeURIComponent(name)}`,
  );
  const children = found.data || found.groups || found;
  const child = children.find((g) => g.name === name);
  expect(child, `the subgroup ${name} was not created`).toBeTruthy();

  const rows = await directMembers(alice.api, child.id);
  const quinnRow = rowFor(rows, world.people.quinn.subject_id);
  expect(quinnRow, 'the named admin is not in the subgroup').toBeTruthy();
  expect(quinnRow.role).toBe('ADMIN');
  expect(rowFor(rows, alice.person.subject_id), 'the creator put herself in after all')
    .toBeFalsy();
});

test('losing the last other admin puts the creator back in', async ({ world, as }) => {
  const alice = await as('alice');
  const modal = await openCreateSubgroupForm(alice.page, world.groups.requestLab.id);

  const checkbox = modal.getByTestId(CREATOR_CHECKBOX).locator('input[type="checkbox"]');
  const search = modal.getByPlaceholder(/search users to add as admins/i);

  const quinnLabel = await displayNameOf(alice.api, world.people.quinn.username);
  await search.fill(world.people.quinn.username);
  await modal.getByText(quinnLabel, { exact: false }).first().click();
  await modal.getByTestId(CREATOR_CHECKBOX).click();
  await expect(checkbox).not.toBeChecked();

  // Removing the only other admin would leave nobody, so the form takes the choice back. The
  // chip's remove control is named after the person it holds, as `Remove <name>`.
  await modal.getByRole('button', { name: /^Remove / }).first().click();

  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeDisabled();
});
