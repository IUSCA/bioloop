/**
 * dataset.attribution.test.js
 *
 * Who to credit for a dataset, and who funded the work. Separate from the owning group,
 * which decides access and nothing else.
 *
 * @see docs/design/groups/decisions.md — 13. Attribution is its own relationship
 */

const path = require('path');
const { RESOURCE_TYPE } = require('@prisma/client');

global.__basedir = path.join(__dirname, '..', '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const datasetService = require('@/services/datasets_v2');
const grantService = require('@/services/grants');
const {
  createTestUser,
  createTestGroup,
  createTestDataset,
  deleteUser,
  deleteGroup,
} = require('../helpers');

let actor;
let owningGroup;
let otherGroup;

const datasetsToDelete = [];
const groupsToDelete = [];
const usersToDelete = [];

beforeAll(async () => {
  actor = await createTestUser('_attribution_actor');
  usersToDelete.push(actor.id);
  owningGroup = await createTestGroup(actor.subject_id, '_attribution_owner');
  otherGroup = await createTestGroup(actor.subject_id, '_attribution_other');
  groupsToDelete.push(owningGroup.id, otherGroup.id);
}, 30_000);

afterAll(async () => {
  for (const id of datasetsToDelete) {
    await prisma.grant.deleteMany({ where: { resource: { dataset: { id } } } });
    await prisma.dataset.deleteMany({ where: { id } });
  }
  for (const id of [...groupsToDelete].reverse()) {
    await deleteGroup(id).catch(() => {});
  }
  for (const id of usersToDelete) await deleteUser(id);
  await prisma.$disconnect();
}, 30_000);

async function newDataset(tag) {
  const d = await createTestDataset(owningGroup.id, tag);
  datasetsToDelete.push(d.id);
  return d;
}

describe('funding', () => {
  test('round-trips through the dataset record', async () => {
    const dataset = await newDataset('_attribution_f1');

    const added = await datasetService.recordFunding(dataset.id, [
      { funder: 'National Institutes of Health', award_number: 'R01HG012345' },
      { funder: 'National Science Foundation', award_number: 'DBI-2021000', note: 'Instrument time' },
    ]);

    expect(added).toBe(2);

    const { funding } = await datasetService.listAttribution(dataset.id);
    expect(funding).toHaveLength(2);
    expect(funding[0].funder).toBe('National Institutes of Health');
    expect(funding[0].award_number).toBe('R01HG012345');
    expect(funding[1].note).toBe('Instrument time');
  });

  test('several sources coexist on one dataset', async () => {
    const dataset = await newDataset('_attribution_f2');

    await datasetService.recordFunding(dataset.id, [
      { funder: 'NIH', award_number: 'R01-A' },
      { funder: 'NIH', award_number: 'R01-B' },
      { funder: 'A Charitable Trust', award_number: 'W-1' },
    ]);

    const { funding } = await datasetService.listAttribution(dataset.id);
    expect(funding).toHaveLength(3);
  });

  test('a funder acknowledged without an award number is allowed once', async () => {
    const dataset = await newDataset('_attribution_f3');

    await datasetService.recordFunding(dataset.id, [{ funder: 'Anonymous donor' }]);
    // Postgres treats every NULL as distinct, so a plain three-column unique index would let
    // this through. The partial index on (dataset_id, funder) WHERE award_number IS NULL is
    // what catches it, and skipDuplicates turns the catch into a no-op.
    expect(await datasetService.recordFunding(dataset.id, [{ funder: 'Anonymous donor' }])).toBe(0);

    const { funding } = await datasetService.listAttribution(dataset.id);
    expect(funding).toHaveLength(1);
    expect(funding[0].award_number).toBeNull();
  });

  test('recording the same award twice adds nothing', async () => {
    const dataset = await newDataset('_attribution_f4');
    const source = [{ funder: 'NIH', award_number: 'R01-DUP' }];

    await datasetService.recordFunding(dataset.id, source);
    expect(await datasetService.recordFunding(dataset.id, source)).toBe(0);

    const { funding } = await datasetService.listAttribution(dataset.id);
    expect(funding).toHaveLength(1);
  });

  test('an empty list adds nothing', async () => {
    const dataset = await newDataset('_attribution_f5');
    expect(await datasetService.recordFunding(dataset.id, [])).toBe(0);
  });

  test('finds the datasets a funder paid for', async () => {
    const dataset = await newDataset('_attribution_f6');
    const funder = `Funder ${Date.now()}`;

    await datasetService.recordFunding(dataset.id, [{ funder, award_number: 'X-1' }]);

    expect(await datasetService.datasetsFundedBy(funder)).toEqual([dataset.id]);
  });
});

describe('affiliation', () => {
  test('credits a group on this platform', async () => {
    const dataset = await newDataset('_attribution_a1');

    await datasetService.recordAffiliations(dataset.id, [
      { group_id: otherGroup.id, role: 'Data collection' },
    ]);

    const { affiliations } = await datasetService.listAttribution(dataset.id);
    expect(affiliations).toHaveLength(1);
    expect(affiliations[0].group.name).toBe(otherGroup.name);
    expect(affiliations[0].role).toBe('Data collection');
  });

  test('credits an organisation with no presence here', async () => {
    const dataset = await newDataset('_attribution_a2');

    await datasetService.recordAffiliations(dataset.id, [
      { organization: 'Somewhere Else University' },
    ]);

    const { affiliations } = await datasetService.listAttribution(dataset.id);
    expect(affiliations[0].organization).toBe('Somewhere Else University');
    expect(affiliations[0].group).toBeNull();
  });

  test('refuses an affiliation naming both a group and an organisation', async () => {
    const dataset = await newDataset('_attribution_a3');

    await expect(datasetService.recordAffiliations(dataset.id, [
      { group_id: otherGroup.id, organization: 'Both' },
    ])).rejects.toThrow(/exactly one of a group or an organization/);
  });

  test('refuses an affiliation naming neither', async () => {
    const dataset = await newDataset('_attribution_a4');

    await expect(datasetService.recordAffiliations(dataset.id, [{ role: 'Analysis' }]))
      .rejects.toThrow(/exactly one of a group or an organization/);
  });

  test('several affiliations coexist on one dataset', async () => {
    const dataset = await newDataset('_attribution_a5');

    await datasetService.recordAffiliations(dataset.id, [
      { group_id: otherGroup.id, role: 'Data collection' },
      { organization: 'Somewhere Else University', role: 'Analysis' },
      { organization: 'A Third Place' },
    ]);

    const { affiliations } = await datasetService.listAttribution(dataset.id);
    expect(affiliations).toHaveLength(3);
  });
});

describe('attribution is not governance', () => {
  test('an affiliated group gains no access to the dataset', async () => {
    const dataset = await newDataset('_attribution_access');
    const outsider = await createTestUser('_attribution_outsider');
    usersToDelete.push(outsider.id);
    await prisma.group_user.create({
      data: { group_id: otherGroup.id, user_id: outsider.subject_id, role: 'MEMBER' },
    });

    const before = await grantService.userHasGrant({
      user_id: outsider.subject_id,
      resource_type: RESOURCE_TYPE.DATASET,
      resource_id: dataset.resource_id,
      access_types: ['DATASET:VIEW_METADATA'],
    });
    expect(before).toBe(false);

    await datasetService.recordAffiliations(dataset.id, [
      { group_id: otherGroup.id, role: 'Data collection' },
    ]);

    // Crediting a group says who did the work, not who may read it.
    const after = await grantService.userHasGrant({
      user_id: outsider.subject_id,
      resource_type: RESOURCE_TYPE.DATASET,
      resource_id: dataset.resource_id,
      access_types: ['DATASET:VIEW_METADATA'],
    });
    expect(after).toBe(false);
  });

  test('the owning group is unchanged by any of it', async () => {
    const dataset = await newDataset('_attribution_owner_unchanged');

    await datasetService.recordAffiliations(dataset.id, [{ group_id: otherGroup.id }]);
    await datasetService.recordFunding(dataset.id, [{ funder: 'NIH', award_number: 'R01-Z' }]);

    const after = await prisma.dataset.findUniqueOrThrow({ where: { id: dataset.id } });
    expect(after.owner_group_id).toBe(owningGroup.id);
  });
});

describe('removal and cascade', () => {
  test('a funding row can be removed', async () => {
    const dataset = await newDataset('_attribution_r1');
    await datasetService.recordFunding(dataset.id, [{ funder: 'NIH', award_number: 'R01-R' }]);

    const { funding } = await datasetService.listAttribution(dataset.id);
    await datasetService.removeFunding(funding[0].id);

    expect((await datasetService.listAttribution(dataset.id)).funding).toHaveLength(0);
  });

  test('deleting a dataset takes its attribution with it', async () => {
    const doomed = await newDataset('_attribution_cascade');
    await datasetService.recordFunding(doomed.id, [{ funder: 'NIH', award_number: 'R01-C' }]);
    await datasetService.recordAffiliations(doomed.id, [{ organization: 'Gone' }]);

    await prisma.grant.deleteMany({ where: { resource: { dataset: { id: doomed.id } } } });
    await prisma.dataset.delete({ where: { id: doomed.id } });

    expect(await prisma.dataset_funding.count({ where: { dataset_id: doomed.id } })).toBe(0);
    expect(await prisma.dataset_affiliation.count({ where: { dataset_id: doomed.id } })).toBe(0);
  });
});
