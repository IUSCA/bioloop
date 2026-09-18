const { test, expect } = require('../../fixtures');
const { grantsHeldBy } = require('../../world/grants');

/**
 * Giving access to a person, through the form an admin actually uses.
 *
 * Every other grant spec issues through the API, which is the right level for the access-type
 * order and for who may issue. It is the wrong level for the one control this flow depends on:
 * the search that turns a half-remembered name into a subject. A search that answers nothing
 * leaves the form with no way forward, and the API suite cannot see that.
 *
 * The regression these guard is a term length floor on `GET /v2/users`. It refused anything
 * under three characters, and the search bar could only render that refusal as "No results
 * found" — the same words it shows for a name nobody has. Every spec that typed into this box
 * filled a whole username, so nothing ever asked for one letter.
 *
 * @see docs/design/groups/user-directory.md — Who may search, and what a search returns
 * @see docs/design/groups/e2e-test-flows.md — F10
 */

const SUBJECT_SEARCH = /Search users by name, username, or email/i;

/**
 * A dataset of this spec's own, in `requestLab`.
 *
 * Never in `lab`. A grant on a dataset also makes its owning group visible, so granting on a
 * `lab` dataset opens the lab's page to the sibling branch and breaks a refusal spec in
 * another file. `requestLab` is the group that absorbs that widening by design.
 */
async function createDataset(ctx, world, label) {
  const name = `${world.prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
  await ctx.api.post('/v2/datasets', {
    name,
    type: 'RAW_DATA',
    owner_group_id: world.groups.requestLab.id,
    origin_path: `/tmp/${world.prefix}/${label}`,
    description: `Give-access UI fixture for ${label}.`,
  });
  const found = await ctx.api.get(`/v2/datasets?name=${encodeURIComponent(name)}`);
  expect(found.data.length, `the dataset ${name} was created and cannot be read back`).toBe(1);
  return found.data[0];
}

/** The Give Access form, opened the way an admin reaches it, with the user search showing. */
async function openUserSubjectSearch(page, resourceId) {
  await page.goto(`/v2/datasets/${resourceId}`);
  await page.getByRole('tab', { name: /Access/ }).first().click();
  await page.getByRole('button', { name: /Give Access/i }).first().click();

  const modal = page.locator('.va-modal').first();
  await expect(modal.getByRole('heading', { name: /Give Access/i })).toBeVisible();

  // The form opens on whichever subject type it last showed; the person half is this spec's.
  await modal.getByRole('button', { name: /^User$/ }).click();
  return modal;
}

test('the subject search answers a single character', async ({ world, as }) => {
  const alice = await as('alice');
  const dataset = await createDataset(alice, world, 'search-one-char');
  const modal = await openUserSubjectSearch(alice.page, dataset.resource_id);

  const search = modal.getByPlaceholder(SUBJECT_SEARCH);
  // One letter of a username somebody in this world actually holds, so the directory cannot
  // be empty of matches and an empty dropdown can only mean the search refused to run.
  await search.fill(world.people.bob.username.slice(0, 1));

  // A row has to appear. Asserting that "No results found" is *hidden* would pass before the
  // debounced search had even run, which is exactly the state this test exists to catch.
  // The row carries an address, which is what tells a person two similar names apart.
  await expect(modal.getByText(/@/).first()).toBeVisible();
});

test('the search narrows to one person, who becomes the subject', async ({ world, as }) => {
  const alice = await as('alice');
  const dataset = await createDataset(alice, world, 'search-narrows');
  const modal = await openUserSubjectSearch(alice.page, dataset.resource_id);

  const search = modal.getByPlaceholder(SUBJECT_SEARCH);
  const frank = world.people.frank;

  // Two characters, then the whole username. Both have to answer; the first is the one the
  // old floor refused, and it is asserted by a row appearing rather than by a message being
  // absent, which would be true before the search ran.
  await search.fill(frank.username.slice(0, 2));
  await expect(modal.getByText(/@/).first()).toBeVisible();

  await search.fill(frank.username);
  await modal.getByText(frank.username, { exact: false }).first().click();

  // Picking a person replaces the search with a chip naming them, which is the form's way of
  // saying the subject is settled.
  await expect(search).toBeHidden();
  await expect(modal.getByText(frank.username, { exact: false }).first()).toBeVisible();
});

test('a person found by search receives the grant the form issues', async ({ world, as }) => {
  const alice = await as('alice');
  const frank = world.people.frank;
  const dataset = await createDataset(alice, world, 'issue-to-person');

  // Frank is in the sibling branch and holds nothing on this dataset before the form runs.
  // `grantsHeldBy` rather than a flat filter: the route groups its reply by subject, so a
  // plain `subject_id` on a grant row is a field that does not exist and matches nothing.
  const before = await grantsHeldBy(alice.api, dataset.resource_id, frank.subject_id);
  expect(before).toHaveLength(0);

  const modal = await openUserSubjectSearch(alice.page, dataset.resource_id);
  const search = modal.getByPlaceholder(SUBJECT_SEARCH);
  await search.fill(frank.username);
  await modal.getByText(frank.username, { exact: false }).first().click();

  // The narrowest access type there is, so the grant proves the flow without widening much.
  await modal.getByText(/See dataset exists/i).first().click();
  await modal.getByRole('button', { name: /^Give Access$/ }).click();
  await expect(modal).toBeHidden();

  const after = await grantsHeldBy(alice.api, dataset.resource_id, frank.subject_id);
  expect(after.length, 'the grant the form issued is not on the dataset').toBeGreaterThan(0);
});
