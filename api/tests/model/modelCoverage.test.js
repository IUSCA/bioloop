/**
 * modelCoverage.test.js
 *
 * The world generator reaches every value the schema can store, and every dimension it
 * varies changes some decision. Without these checks a harness can pass because its data
 * never contained the case a bug lives in.
 *
 * - Every value of every enum a decision reads appears in a generated world, or is listed
 *   below with the reason no decision reads it. A value added to the schema fails here until
 *   it is placed in one or the other.
 * - The access types the worlds use are exactly the ones the app defines, and the archived
 *   dimension puts every resource type's archived state into some world.
 * - The covering set covers every feasible pair of dimension values.
 * - Every dimension has a sensitivity pair: two cells differing only in that dimension that the
 *   reference model decides differently. A dimension without one is data that cannot test it.
 * - The committed decision table is what the reference model produces now.
 *
 * Failures name the offending row with the `[label, value]` idiom.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Worlds
 */

const fs = require('fs');
const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const Prisma = require('@prisma/client');

const { policyRegistry } = require('@/authorization');
const state = require('@/state');

const { modelTablesFrom } = require('./tables');
const { MODELLED_RESOURCE_TYPES } = require('./reference');
const { renderDecisionTable, outcomeSignature } = require('./decisionTable');
const W = require('./worlds');

const tables = modelTablesFrom(policyRegistry);
const cover = W.allPairs();
const { world } = W.buildWorld(cover);
const datasetIds = new Set(world.datasets.map((d) => d.id));

/** Where each enum's values appear in a generated world. */
const REACHED = {
  GROUP_MEMBER_ROLE: world.memberships.map((m) => m.role),
  SUBJECT_TYPE: world.grants.map((g) => g.subject_type),
  RESOURCE_TYPE: world.grants.map((g) => (datasetIds.has(g.resource) ? 'DATASET' : 'COLLECTION')),
  PROFILE_VISIBILITY: [...world.groups, ...world.collections].map((r) => r.profile_visibility),
  GRANT_CREATION_TYPE: world.grants.map((g) => g.creation_type),
  GRANT_REVOCATION_TYPE: world.grants.map((g) => g.revocation_type),
  // The statuses some step is possible in, read from the request's own state rules rather
  // than from a table beside the policies. A status no action admits is terminal, and each
  // one is listed below with the step that produced it.
  // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
  ACCESS_REQUEST_STATUS: Object.values(Prisma.ACCESS_REQUEST_STATUS).filter((status) => state
    .stateRegistry.get('access_request').getActionNames()
    // Only the steps whose rule reads the status. Reading a request is possible in every
    // status, so including it would report every status as one a step can be taken in.
    .filter((action) => state.requiredFields('access_request', [action]).includes('status'))
    .some((action) => state.check('access_request', action, {
      status,
      target: { kind: 'dataset', archived: false, deleted: false },
      subject: { kind: 'user', archived: false },
    }) === null)),
};

/**
 * Values no decision reads, each with the reason. An entry here is a claim about the policies,
 * so it is checked against them where it can be.
 */
const NOT_READ = {
  // A pending invitation confers nothing. Accepting one creates a membership, which the
  // worlds vary directly.
  INVITATION_STATUS: ['PENDING', 'ACCEPTED', 'CANCELLED'],
  // A renewal request is decided like a new one. The type labels the request for reviewers.
  ACCESS_REQUEST_TYPE: ['NEW', 'RENEWAL'],
  // Item decisions are written by `review`; the review transition reads the request status.
  ACCESS_REQUEST_ITEM_DECISION: ['PENDING', 'APPROVED', 'REJECTED'],
  // A decision reads a grant's subject, access type, and validity. Creation type records
  // where the grant came from. The worlds carry MANUAL and SYSTEM_BOOTSTRAP only because
  // they mirror seeded rows.
  GRANT_CREATION_TYPE: ['ACCESS_REQUEST'],
  // The statuses a request ends in. No step is possible in them, which is what makes them
  // terminal, so each is named here with the step that wrote it. An expired request is set by
  // the expiry job rather than by a policed action.
  ACCESS_REQUEST_STATUS: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
};

const ENUMS = [...new Set([...Object.keys(REACHED), ...Object.keys(NOT_READ)])];

describe('every enum value is reached or declared unread', () => {
  test.each(ENUMS)('%s', (name) => {
    const values = Object.values(Prisma[name]);
    const reached = new Set(REACHED[name] ?? []);
    const unread = new Set(NOT_READ[name] ?? []);
    values.forEach((value) => {
      const label = `${name}.${value}`;
      expect([label, reached.has(value) || unread.has(value)]).toEqual([label, true]);
    });
    // A value listed as unread that a world reaches is a stale entry.
    [...unread].forEach((value) => {
      const label = `${name}.${value} listed unread but reached`;
      expect([label, reached.has(value)]).toEqual([label, false]);
    });
  });
});

/**
 * Registered types the reference model does not decide, each with the test that decides it
 * instead. A container a derived app registers fails until it is modelled or listed here.
 */
const NOT_MODELLED = {
  // Every capability, in every status, for the requester, an admin, and a platform admin.
  access_request: 'tests/model/transitionsArm.test.js',
  // Its terms read the resource's owning group, hydrated from a grant id.
  grant: 'tests/authorization/grantHydrator.test.js',
  // `list` is the directory search a group admin may run.
  user: 'tests/routes/users_v2.directory.test.js',
  // `read_records` is platform admin only.
  audit: 'tests/authorization/platformAdminShortCircuit.test.js',
};

test('every registered resource type is modelled or names the test that decides it', () => {
  policyRegistry.listTypes().forEach((type) => {
    const label = `resource type ${type}`;
    const placed = MODELLED_RESOURCE_TYPES.includes(type)
      || fs.existsSync(path.join(__dirname, '..', '..', NOT_MODELLED[type] ?? '.missing'));
    expect([label, placed]).toEqual([label, true]);
  });
  // A listed type that is also modelled, or no longer registered, is a stale entry.
  Object.keys(NOT_MODELLED).forEach((type) => {
    const label = `${type} listed not modelled`;
    expect([label, !MODELLED_RESOURCE_TYPES.includes(type) && policyRegistry.listTypes().includes(type)])
      .toEqual([label, true]);
  });
});

test('the worlds use exactly the access types the app defines', () => {
  expect([...new Set(W.ACCESS_TYPES)].sort()).toEqual([...new Set(tables.accessTypes)].sort());
});

test('the worlds reach the archived state of every resource type that has one', () => {
  // The archived state is a column on the row now, so the worlds are searched for the rows
  // rather than for restriction rows pointing at them. A resource type whose state rules read
  // an archived column, and that no world archives, is a dimension the data cannot test.
  // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
  const archivedIn = {
    group: world.groups.some((g) => g.archived === true),
    collection: world.collections.some((c) => c.archived === true),
    // A dataset has no archived column: what reaches one is its owning group's state.
    dataset: world.datasets.some((d) => world.groups.find((g) => g.id === d.owner)?.archived === true),
  };
  Object.entries(archivedIn).forEach(([type, reached]) => {
    expect([`${type} archived somewhere`, reached]).toEqual([`${type} archived somewhere`, true]);
  });
  // Forced unless a world leaves it open too: a harness that archived everything would pass
  // the check above and test nothing.
  expect(world.groups.some((g) => !g.archived)).toBe(true);
});

test('the covering set covers every feasible pair', () => {
  const uncovered = W.feasiblePairs();
  const names = W.DIMENSION_NAMES;
  cover.forEach((cell) => {
    names.forEach((d1, i) => names.slice(i + 1)
      .forEach((d2) => uncovered.delete(`${d1}=${cell[d1]}|${d2}=${cell[d2]}`)));
  });
  expect([...uncovered]).toEqual([]);
  // Sizes, so a reader can see the reduction the harness relies on.
  expect(W.productSize()).toBeGreaterThan(cover.length * 1000);
});

test('every dimension has a sensitivity pair', () => {
  const { pairs } = W.addSensitivityPairs(cover, (cell) => outcomeSignature(tables, cell));
  W.DIMENSION_NAMES.forEach((dim) => {
    expect([dim, pairs[dim] !== null]).toEqual([dim, true]);
  });
});

test('the committed decision table is current', () => {
  const file = path.join(__dirname, '..', '..', '..', 'docs', 'design', 'groups', 'generated', 'access-decisions.md');
  const { markdown } = renderDecisionTable(tables);
  // Run `npm run model:table` when this fails.
  expect(fs.readFileSync(file, 'utf8') === markdown).toBe(true);
});
