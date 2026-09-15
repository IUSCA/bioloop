/**
 * engineArm.test.js
 *
 * The Engine arm: every action on every dataset, collection, and group in the covering world,
 * decided by `authorizeAction` from identifiers alone, against the reference model.
 *
 * Every disagreement must match a classification below. A classification names what the
 * disagreement is, where it is decided, and the phase that removes it. A new disagreement
 * fails as unclassified, and a classification that no longer matches anything fails as stale,
 * so the list cannot outlive the fix it waits for.
 *
 * Two bugs this arm found are fixed and have no entry. `group.add_dataset` admitted any caller
 * to a group accepting contributions, and a grant to a system principal made its owning group
 * visible. Cell 3 (an anonymous caller) and cell 47 (a grant to Authenticated Users) failed
 * before the fixes.
 *
 * @see docs/design/groups/access-model-verification-plan.md — Comparison arms
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const prisma = require('@/db');
const { policyRegistry } = require('@/authorization');

const { modelTablesFrom } = require('./tables');
const { outcomeSignature } = require('./decisionTable');
const W = require('./worlds');
const { writeWorld } = require('./dbWorld');
const { runEngineArm, runTermFormsArm, runCreatesArm } = require('./engineArm');

const CLASSIFIED = [
  {
    name: 'a deleted dataset still admits mutating and data-plane actions',
    decided: 'decisions.md 16, row 4',
    removedIn: 'Phase 6, operation effects',
    matches: (d) => d.resourceType === 'dataset'
      && d.dims.deleted === 'yes'
      && d.reference.blockedBy === 'DELETED'
      && d.engine.allowed === true,
  },
];

let result;
let written;
let arm;

beforeAll(async () => {
  const tables = modelTablesFrom(policyRegistry);
  const { cells } = W.addSensitivityPairs(W.allPairs(), (cell) => outcomeSignature(tables, cell));
  const { world, fragments } = W.buildWorld(cells, { now: new Date() });
  written = await writeWorld(prisma, world);
  arm = {
    tables, world, fragments, ids: written.ids,
  };
  result = await runEngineArm(arm);
}, 300_000);

afterAll(async () => {
  if (written) await written.cleanup();
  await prisma.$disconnect();
}, 120_000);

test('the arm decided every action in the world', () => {
  expect(result.decisions).toBeGreaterThan(5000);
});

test('the engine never throws on a decision', () => {
  const thrown = result.disagreements.filter((d) => d.engine.error)
    .map((d) => `${d.resourceType}.${d.action} cell ${d.cell}: ${d.engine.error}`);
  expect(thrown).toEqual([]);
});

test('every disagreement is classified', () => {
  const unclassified = result.disagreements
    .filter((d) => !CLASSIFIED.some((c) => c.matches(d)))
    .map((d) => `${d.resourceType}.${d.action} cell ${d.cell}: engine ${JSON.stringify(d.engine)}, `
      + `reference ${JSON.stringify(d.reference)}, ${JSON.stringify(d.dims)}`);
  expect(unclassified).toEqual([]);
});

test('the two forms of the grant term agree row for row', async () => {
  const { comparisons, disagreements } = await runTermFormsArm({ prisma, ...arm });
  expect(comparisons).toBeGreaterThan(500);
  expect(disagreements.map((d) => `${d.type} cell ${d.cell}: per-resource ${d.perResource}, list ${d.list}`))
    .toEqual([]);
}, 120_000);

test('a create decided from the owning group agrees with the reference', async () => {
  // An archived owning group, or an archived ancestor of it, blocks a create. Before Phase 0 a
  // create had no restriction target and nothing blocked it.
  const { decisions, disagreements } = await runCreatesArm(arm);
  expect(decisions).toBeGreaterThan(50);
  expect(disagreements.map((d) => `${d.resourceType}.create cell ${d.cell}: engine ${JSON.stringify(d.engine)}, `
    + `reference ${JSON.stringify(d.reference)}`)).toEqual([]);
}, 120_000);

test('every classification still matches a disagreement', () => {
  CLASSIFIED.forEach((c) => {
    const count = result.disagreements.filter((d) => c.matches(d)).length;
    expect([c.name, count > 0]).toEqual([c.name, true]);
  });
});
