const { test, expect } = require('../../fixtures');
const {
  expectRefused, expectForbidden, expectNotForbidden, expectAbsentButPresent, expectConcealed,
} = require('../../assertions/parity');
const { recordApiCalls, expectAllRefused } = require('../../assertions/replay');

/**
 * The refusal spine, on one dataset.
 *
 * Flows N1 and H1. The question these answer is not "does the page look empty" but "does
 * every way in refuse", because the page and the route behind it are separate code.
 *
 * @see docs/design/groups/e2e-test-flows.md — N1, H1
 */

test('N1 — every call the dataset page makes is refused for a stranger', async ({ world, as }) => {
  const [bob, frank] = await Promise.all([as('bob'), as('frank')]);
  const datasetId = world.datasets.labPrimary.resource_id;

  // Record from the member's session, because only a page that actually loaded makes the
  // full set of calls. Recording from the stranger would capture whatever the page manages
  // before it gives up, which is the subset that proves the least.
  const calls = await recordApiCalls(bob, async (page) => {
    await page.goto(`/v2/datasets/${datasetId}`);
    await expect(page.getByTestId('dataset-detail')).toBeVisible();
    // The tabs fetch on demand, so a page left on Overview never asks for files or requests —
    // exactly the calls N1 most wants replayed.
    for (const tab of ['Files', 'Requests']) {
      const link = page.getByRole('tab', { name: new RegExp(tab, 'i') })
        .or(page.getByRole('button', { name: new RegExp(`^${tab}`, 'i') }));
      if (await link.count()) {
        await link.first().click();
        await page.waitForLoadState('networkidle').catch(() => {});
      }
    }
  });

  console.log(`recorded ${calls.length} calls the dataset page makes:`);
  calls.forEach((c) => console.log(`  ${c.method} ${c.url}`));

  await expectAllRefused(frank, calls);
});

test('N1 — the page itself refuses, and says so', async ({ world, as }) => {
  const frank = await as('frank');
  await frank.page.goto(`/v2/datasets/${world.datasets.labPrimary.resource_id}`);

  // The refusal region, not merely the absence of the detail region. Spike 5 found that a
  // malformed URL rendered the identical "Failed to load dataset", so absence alone would
  // pass for a spec that simply had the id shape wrong.
  const state = frank.page.getByTestId('error-state');
  await expect(state).toBeVisible();
  await expect(frank.page.getByTestId('dataset-detail')).toHaveCount(0);

  // It has to read as a refusal rather than as a broken page, which is also what now
  // separates this from the malformed-URL case: that one is not a 403 and still falls back
  // to "Failed to load dataset".
  await expect(state).toContainText(/do not have access/i);

  // And it must not leak the axios error, which named the status and, by answering at all,
  // confirmed the dataset exists to someone who may not see it.
  await expect(state).not.toContainText(/Request failed with status code/i);
  await expect(state).not.toContainText(/403/);
});

test('H1 — a stranger\'s dataset list omits what they cannot reach', async ({ world, as }) => {
  const frank = await as('frank');
  await frank.page.goto('/v2/datasets');

  const list = frank.page.getByTestId('dataset-list');
  // The paired positive assertion. A name being absent from a page that never rendered is
  // not evidence of anything.
  await expectAbsentButPresent({
    present: list,
    absent: frank.page.getByText(world.datasets.labPrimary.name, { exact: false }),
  });
});

/**
 * The file plane, addressed directly.
 *
 * These routes are in N1's list — the file list, the tree, the search, the bundle — and the
 * page cannot exercise them here: a fixture dataset is created through the API with no
 * ingestion, so it holds no file rows and the Files tab renders without issuing a request.
 * The replay above therefore never reaches them, and leaving them out would leave the read
 * plane untested.
 *
 * `list_files` *is* the read plane in this model; there is no separate `READ_DATA` access
 * type. A caller refused here is refused the data itself.
 */
const READ_PLANE = [
  (id) => `/v2/datasets/${id}/files`,
  (id) => `/v2/datasets/${id}/files/tree`,
  (id) => `/v2/datasets/${id}/files/search?name=a`,
];

const DOWNLOAD_PLANE = [
  (id) => `/v2/datasets/${id}/files/bundle/download_info`,
];

test('N1 — the file plane is refused by authorization, not by accident', async ({ world, as }) => {
  const [frank, quinn, priya] = await Promise.all([as('frank'), as('quinn'), as('priya')]);
  const id = world.datasets.labPrimary.resource_id;
  const everyRoute = [...READ_PLANE, ...DOWNLOAD_PLANE];

  for (const stranger of [frank, quinn]) {
    for (const path of everyRoute) {
      // 404 exactly, not "any refusal": a stranger holds no standing on the dataset, so the
      // refusal is the answer an unknown id gets. The control below is what keeps a route that
      // 404s for everybody from passing.
      // eslint-disable-next-line no-await-in-loop
      await expectConcealed(stranger.api, 'GET', path(id));
    }
  }

  // The control that gives the assertion above its meaning: the same paths, a caller the
  // engine allows unconditionally, and no 403 anywhere. A route that refused everybody would
  // fail here, which is precisely the way the first version of this spec was wrong.
  for (const path of everyRoute) {
    // eslint-disable-next-line no-await-in-loop
    await expectNotForbidden(priya.api, 'GET', path(id));
  }
});

test('H3 — reading and downloading are gated separately', async ({ world, as }) => {
  // Decision 12: creating a dataset seeds its owning group a grant of DATASET:LIST_FILES.
  // The access-type order runs DOWNLOAD → LIST_FILES → VIEW_METADATA, so that grant confers
  // metadata and file listing and stops short of the bytes. Bob holds it through membership
  // of the owning lab and nothing else.
  const bob = await as('bob');
  const id = world.datasets.labPrimary.resource_id;

  for (const path of READ_PLANE) {
    // What is being asserted is that the policy let Bob through, not what the handler then
    // found. The fixture dataset holds no files, which is now an empty listing rather than
    // a 404.
    // eslint-disable-next-line no-await-in-loop
    await expectNotForbidden(bob.api, 'GET', path(id));
  }

  for (const path of DOWNLOAD_PLANE) {
    // eslint-disable-next-line no-await-in-loop
    await expectForbidden(bob.api, 'GET', path(id));
  }
});

test('H1 — addressing the dataset directly is refused by the route', async ({ world, as }) => {
  const [frank, quinn] = await Promise.all([as('frank'), as('quinn')]);
  const ds = world.datasets.labPrimary;

  for (const stranger of [frank, quinn]) {
    await expectRefused(stranger.api, 'GET', `/v2/datasets/${ds.resource_id}`);
  }
});
