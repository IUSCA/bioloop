const { test, expect } = require('../../fixtures');

/**
 * Spike 1 — can Playwright drive a Vuestic `va-select`?
 *
 * The v2-ui-changes skill records that `va-select` ignores a synthetic click on its rendered
 * option and ignores ArrowDown-plus-Enter after the listbox opens, and that the workaround is
 * to reach the Vue component instance and assign to `setupState`. Every one of those attempts
 * dispatched events from `evaluate_script`.
 *
 * Playwright does not dispatch events. It drives real input over the Chrome DevTools Protocol,
 * which a component cannot distinguish from a person. So the finding may not transfer, and the
 * answer decides how much component work phases 3 and 4 need.
 *
 * The target is the role select in AddGroupMemberModal: static options, no async load, three
 * navigations from a signed-in start. There are no test hooks in the v2 tree yet, so this
 * throwaway spec selects by text and role.
 *
 * It runs as `alice`, who administers the world's `lab`. Which seeded account administers which
 * seeded group is decided by a hash and moves whenever the seed changes, so the spike borrows
 * the fixture world rather than naming a seeded group and its admin.
 *
 * @see docs/design/groups/implementation/e2e-test-plan.md — Phase 0
 */

// Alice is deliberately not a platform admin: the engine allows a platform admin before any
// policy runs, so a pass driven as one exercises nothing.
test('a va-select changes value under real Playwright input', async ({ world, as }) => {
  // Collected only after sign-in. The dev-login round trip itself logs a 401, because the
  // first request goes out before a token exists, and that is the login working rather than
  // a defect.
  const { page } = await as('alice', `/v2/groups/${world.groups.lab.id}`);
  await page.waitForURL(`**/v2/groups/${world.groups.lab.id}`, { timeout: 30_000 });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Vuestic renders a tab as a div carrying role="tab", not as a button.
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Add Member' }).first().click();

  // Held by position within the modal, not by its own text. A locator filtered on `MEMBER`
  // stops matching the moment the value changes, which reads as "the element vanished"
  // rather than as "the click worked".
  const modal = page.locator('.va-modal').first();
  const select = modal.locator('.va-select').first();
  await expect(select).toBeVisible();
  await expect(select).toContainText('MEMBER');

  // The paired positive assertion. Without it, a mis-typed selector below would report
  // "cannot drive va-select" when the truth is "never reached the modal".
  await expect(page.getByPlaceholder('name@university.edu')).toBeVisible();

  await select.click();
  const option = page.getByRole('option', { name: 'ADMIN' });
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();

  // Retrying assertion rather than a read: a click updates a ref and Vue renders on the next
  // tick, so reading in the same breath returns the value from before the render.
  await expect(select).toContainText('ADMIN');

  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});

/**
 * A second case, in a different component, so the answer does not rest on one select.
 * `UploadDatasetModal`'s dataset-type select sits in a different modal, is built from a
 * constant rather than from the same inline array, and is reached by a different path.
 */
test('a second va-select, in a different component, also changes', async ({ as }) => {
  const { page } = await as('alice', '/v2/datasets');
  await page.waitForURL('**/v2/datasets**', { timeout: 30_000 });

  await page.getByRole('button', { name: 'New Dataset' }).click();
  await page.getByRole('button', { name: 'Upload' }).click();

  const modal = page.locator('.va-modal').first();
  const typeSelect = modal.locator('.va-select').first();
  await expect(typeSelect).toBeVisible();
  await expect(typeSelect).toContainText('Raw Data');

  // Paired positive: proves the modal really rendered, so a failure below is about the
  // select rather than about never having got here.
  await expect(modal).toContainText('Upload Dataset');

  await typeSelect.click();
  await page.getByRole('option', { name: 'Data Product' }).click();

  await expect(typeSelect).toContainText('Data Product');
});
