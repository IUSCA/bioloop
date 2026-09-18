const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('../../fixtures');
const { expectConflict, expectForbidden } = require('../../assertions/parity');
const { createImportSource } = require('../../world/importSources');

/**
 * Importing a directory from an import source, through the dialog a person uses.
 *
 * The flow gets a lab of its own. An import adds a dataset to its owning group, and a spec that
 * counts the datasets of `lab` or `requestLab` would change its answer depending on whether
 * this file ran first.
 *
 * An import starts the `integrated` workflow, and the development workers are live. The test
 * pauses that run before the workers' stability wait ends, so nothing is inspected or archived
 * for a dataset that teardown is about to delete. The wait is 30 seconds from the last change
 * under the directory, and the spec touches the directory just before submitting.
 *
 * @see docs/design/groups/e2e-test-flows.md — D7
 */

const random = () => Math.random().toString(36).slice(2, 8);

/** A lab under the run's centre, administered by Alice. */
async function createImportLab(priya, world) {
  return priya.api.post(`/groups/${world.groups.center.id}/children`, {
    name: `${world.prefix}-import-lab-${random()}`,
    description: `Import flow fixture for end-to-end run ${world.runId}.`,
    admins: [world.people.alice.subject_id],
    members: [],
  });
}

/** Marks the directory as just changed, which restarts the workers' stability wait. */
function touch(directory) {
  const now = new Date();
  fs.utimesSync(path.join(directory, 'README.txt'), now, now);
}

/**
 * New Dataset, then the Import card. Returns the import dialog once its selects have options.
 *
 * Opening the dialog fetches the import sources and the eligible owner groups. A select clicked
 * before its fetch returns opens empty and never shows the option, which is how this spec failed
 * under a full parallel run. The page's own eligible-owner-groups fetch has finished once the
 * New Dataset button shows, so the wait below can only match the dialog's.
 */
async function openImportDialog(page) {
  await page.goto('/v2/datasets');
  await expect(page.getByTestId('dataset-list')).toBeVisible();
  await page.getByRole('button', { name: /New Dataset/ }).click();

  const loaded = Promise.all([
    page.waitForResponse((r) => r.url().includes('/v2/import-sources')),
    page.waitForResponse((r) => r.url().includes('/v2/datasets/eligible-owner-groups')),
  ]);
  await page.getByRole('button', { name: /^Import\b/ }).click();
  await loaded;

  const dialog = page.locator('.va-modal').filter({ hasText: 'Import Dataset' });
  await expect(dialog.getByRole('heading', { name: 'Import Dataset' })).toBeVisible();
  return dialog;
}

/** Picks an option from a Vuestic select, located by its label. */
async function choose(page, dialog, label, option) {
  await dialog.locator('.va-select').filter({ hasText: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/** The dataset name field. Vuestic does not tie its label to the input, so no label locator. */
const nameInput = (dialog) => dialog.locator('.import-name-input input');

/** Picks the source, then types a directory name and clicks its suggestion. */
async function chooseDirectory(page, dialog, { source, group, directory }) {
  await choose(page, dialog, 'Import Source', `${source.label} (${group.name})`);
  await dialog.getByPlaceholder('Start typing a directory name').fill(directory);
  await dialog.getByRole('button', { name: directory, exact: true }).click();
}

test('D7 — a group imports a directory from its own import source', async ({ world, as }) => {
  const [priya, alice, erin] = await Promise.all([as('priya'), as('alice'), as('erin')]);
  const lab = await createImportLab(priya, world);

  const imported = `${world.prefix}-run-a-${random()}`;
  const untouched = `${world.prefix}-run-b-${random()}`;
  const source = await createImportSource({
    prefix: world.prefix,
    label: `${world.prefix} instrument drop`,
    ownerGroupId: lab.id,
    directories: [imported, untouched],
  });
  const importedPath = path.join(source.path, imported);

  // Alice imports the first directory. The name fills in from the directory.
  let dialog = await openImportDialog(alice.page);
  await chooseDirectory(alice.page, dialog, { source, group: lab, directory: imported });
  await expect(nameInput(dialog)).toHaveValue(imported);
  await choose(alice.page, dialog, 'Owning Group', lab.name);

  touch(importedPath);
  await dialog.getByRole('button', { name: /Import Dataset/ }).click();
  await expect(dialog).toBeHidden();
  await expect(alice.page.getByText(`Imported ${imported}`)).toBeVisible();
  await expect(alice.page.getByTestId('dataset-list').getByText(imported)).toBeVisible();

  const { data: found } = await alice.api.get(`/v2/datasets?name=${encodeURIComponent(imported)}`);
  expect(found.length, `the imported dataset ${imported} cannot be read back`).toBe(1);
  const dataset = found[0];

  // Pause first and assert afterwards, so the workers never reach the directory.
  const runs = await alice.api.get(`/v2/datasets/${dataset.resource_id}/workflows`);
  await Promise.all(runs.map((run) => priya.api.post(
    `/v2/datasets/${dataset.resource_id}/workflows/${run.id}/pause`,
  )));
  expect(runs.map((run) => run.name), 'the import should start one integrated workflow')
    .toEqual(['integrated']);
  expect(dataset.owner_group_id).toBe(lab.id);

  // A name the lab already holds is marked on the field, and the import cannot be submitted.
  dialog = await openImportDialog(alice.page);
  await chooseDirectory(alice.page, dialog, { source, group: lab, directory: untouched });
  await choose(alice.page, dialog, 'Owning Group', lab.name);
  const nameField = nameInput(dialog);
  await nameField.fill(imported);
  await nameField.blur();
  await expect(dialog.getByText('That name is already used in this group')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Import Dataset/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // One directory is never two datasets, and the refusal names neither the dataset nor the lab.
  const duplicate = {
    name: `${world.prefix}-duplicate-${random()}`,
    type: 'RAW_DATA',
    origin_path: importedPath,
    owner_group_id: lab.id,
  };
  await expectConflict(alice.api, 'POST', '/v2/datasets/imports', duplicate);
  const { body: duplicateBody } = await alice.api.raw('POST', '/v2/datasets/imports', duplicate);
  // The name is new, so the 409 comes from the directory and not from the name.
  expect(duplicateBody).toContain('already registered');
  expect(duplicateBody).not.toContain(imported);
  expect(duplicateBody).not.toContain(lab.name);

  // Erin may create datasets in Patel Lab, so a refusal here is about the source.
  const erinGroups = await erin.api.get('/v2/datasets/eligible-owner-groups');
  expect(erinGroups.map((g) => g.id)).toContain(world.groups.siblingLab.id);
  const erinSources = await erin.api.get('/v2/import-sources');
  expect(erinSources.map((s) => s.id)).not.toContain(source.id);
  const aliceSources = await alice.api.get('/v2/import-sources');
  expect(aliceSources.map((s) => s.id)).toContain(source.id);

  const erinImport = {
    name: `${world.prefix}-erin-${random()}`,
    type: 'RAW_DATA',
    origin_path: path.join(source.path, untouched),
    owner_group_id: world.groups.siblingLab.id,
  };
  await expectForbidden(erin.api, 'POST', '/v2/datasets/imports', erinImport);
  const { body: erinBody } = await erin.api.raw('POST', '/v2/datasets/imports', erinImport);
  expect(erinBody).toContain('not inside an import source');
});
