/**
 * stateArm.test.js
 *
 * The State arm: what the resource's state admits, from the state containers, against the
 * reference model's own statement of the same thing.
 *
 * The two halves of a response are answered by different layers, and this arm covers the half
 * authorization does not touch. The reference states it from each action's restriction class;
 * `src/state` states it as a rule per action per resource. Neither reads the other, so a
 * disagreement is a bug in one of them.
 *
 * Pure: no world is written to the database, because a state rule reads a row the caller
 * fetched and nothing else.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const state = require('@/state');
const { policyRegistry } = require('@/authorization');

const { modelTablesFrom } = require('./tables');
const { createReference } = require('./reference');
const W = require('./worlds');

const tables = modelTablesFrom(policyRegistry);
const { world, fragments } = W.buildWorld(W.allPairs());
const ref = createReference(tables, world);

const groupOf = (id) => world.groups.find((g) => g.id === id);

/** The row each container reads, built from the world as a service's own query would build it. */
const rowFor = (resourceType, f) => ({
  group: () => ({ is_archived: groupOf(f.owner.id).archived === true }),
  collection: () => ({
    is_archived: f.collection.archived === true,
    owner_group: { is_archived: groupOf(f.collection.owner).archived === true },
    // No world tracks a collection's history, so `delete` is decided on the archived state
    // alone here. `tests/state/serviceStateChecks.test.js` covers the history refusal.
    has_history: false,
  }),
  dataset: () => ({
    is_deleted: f.dataset.deleted === true,
    owner_group: { is_archived: groupOf(f.dataset.owner).archived === true },
  }),
}[resourceType]());

const RESOURCE_TYPES = ['group', 'collection', 'dataset'];

let disagreements;
let decisions;

beforeAll(() => {
  disagreements = [];
  decisions = 0;
  fragments.forEach((f) => {
    const ids = { group: f.owner.id, collection: f.collection.id, dataset: f.dataset.id };
    RESOURCE_TYPES.forEach((resourceType) => {
      const row = rowFor(resourceType, f);
      Object.keys(tables.actions[resourceType]).forEach((action) => {
        decisions += 1;
        const admits = state.check(resourceType, action, row) === null;
        const reference = ref.stateAdmits(resourceType, action, ids[resourceType]);
        if (admits !== reference) {
          disagreements.push(`${resourceType}.${action} cell ${f.index}: state admits ${admits}, `
            + `reference ${reference}, ${JSON.stringify(f.cell)}`);
        }
      });
    });
  });
});

test('the arm decided every action on every resource in the world', () => {
  expect(decisions).toBeGreaterThan(3000);
});

test('the state rules and the reference agree on every action', () => {
  expect(disagreements).toEqual([]);
});

test('the arm is not decided by one answer', () => {
  // Forced unless the worlds hold both: an arm where every state admitted everything would
  // pass the comparison above without testing a refusal.
  const refused = [];
  const admitted = [];
  fragments.forEach((f) => {
    const row = rowFor('dataset', f);
    const answer = state.check('dataset', 'edit_metadata', row);
    (answer === null ? admitted : refused).push(f.index);
  });
  expect(refused.length).toBeGreaterThan(0);
  expect(admitted.length).toBeGreaterThan(0);
});
