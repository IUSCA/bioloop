/**
 * restrictionSeam.test.js
 *
 * The restriction seam still works, though no builtin restriction uses it.
 *
 * `checkRestriction` returns null for every action until a restriction type is specified. A
 * no-op with no test is a seam that can break silently and be noticed years later, so this
 * injects a checker that blocks one action and asserts all three places a restriction acts: the
 * decision itself, the capability map, and a list row's capabilities.
 *
 * This is deliberately not the state layer. A restriction is a rule somebody applies to a
 * resource; what a resource's state admits is separate and answers 409 from the services.
 *
 * @see docs/design/groups/design.md — Every action passes the check
 * @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..');
require('module-alias/register');

const prisma = require('@/db');
const { policyRegistry, hydratorRegistry } = require('@/authorization');
const { createDecisionPipeline, filterRestrictedCapabilities } = require('@/authorization/core/pipeline');
const { isPlatformAdmin } = require('@/authorization/builtin/policies/utils/index');
const { expandPath } = require('@/authorization/builtin/paths/standing');
const { pathRegistry } = require('@/authorization/builtin/paths');
const {
  createTestUser, createTestGroup, createTestDataset, deleteDataset, deleteGroup, deleteUser,
} = require('../services/helpers');

const BLOCKED = 'edit_metadata';

/** A checker that blocks one action on datasets and nothing else. */
const oneActionChecker = async ({ resourceType, action }) => (
  resourceType === 'dataset' && action === BLOCKED ? 'TEST_BLOCK' : null
);

const decideWithChecker = createDecisionPipeline({
  policyRegistry,
  hydratorRegistry,
  restrictionChecker: oneActionChecker,
  platformAdmin: { policy: isPlatformAdmin },
  expandPath,
  concealRefusalsWithoutStanding: pathRegistry.listTypes(),
});

const freshContext = () => ({ cache: { user: new Map(), resource: new Map(), context: new Map() } });

let admin;
let group;
let dataset;

beforeAll(async () => {
  admin = await createTestUser('_seam_admin');
  group = await createTestGroup(admin.subject_id, '_seam_group');
  await prisma.group_user.create({
    data: { group_id: group.id, user_id: admin.subject_id, role: 'ADMIN' },
  });
  dataset = await createTestDataset(group.id, '_seam_ds');
}, 60_000);

afterAll(async () => {
  await deleteDataset(dataset.id).catch(() => {});
  await deleteGroup(group.id).catch(() => {});
  await deleteUser(admin.id).catch(() => {});
  await prisma.$disconnect();
}, 60_000);

const decide = (action, options = {}) => decideWithChecker('dataset', action, {
  identifiers: { user: admin.subject_id, resource: dataset.resource_id },
  policyExecutionContext: freshContext(),
  ...options,
});

test('the group admin holds the action when no checker blocks it', async () => {
  // The control. Without this the test below could pass because the admin never held it.
  const { authorizeAction } = require('@/authorization'); // eslint-disable-line global-require
  const permission = await authorizeAction('dataset', BLOCKED, {
    identifiers: { user: admin.subject_id, resource: dataset.resource_id },
    policyExecutionContext: freshContext(),
  });
  expect(permission.granted).toBe(true);
});

test('a blocked action is refused, and the refusal names what blocked it', async () => {
  const permission = await decide(BLOCKED);

  expect(permission.granted).toBe(false);
  expect(permission.blockedBy).toBe('TEST_BLOCK');
});

test('an action the checker leaves alone is still granted', async () => {
  // Both are actions this caller is known to hold: `dataset.edit` and `manage_grants` are
  // gated by grant terms rather than by owning-group admin, so they would fail for a reason
  // that has nothing to do with the checker.
  expect((await decide('view_metadata')).granted).toBe(true);
  expect((await decide('view_audit_logs')).granted).toBe(true);
});

test('a blocked action is absent from the capability map', async () => {
  const permission = await decide('view_metadata', { shouldDeriveCapabilities: true });

  expect(permission.capabilities[BLOCKED]).toBe(false);
  // The shape survives: a blocked capability is false rather than missing.
  expect(Object.keys(permission.capabilities)).toContain(BLOCKED);
  // Forced unless the filter is selective: an all-false map would pass the check above.
  expect(permission.capabilities.view_audit_logs).toBe(true);
});

test('the same filter runs over a list row', async () => {
  const filtered = await filterRestrictedCapabilities({
    capabilities: { [BLOCKED]: true, view_metadata: true },
    resourceType: 'dataset',
    resourceId: dataset.resource_id,
    preFetchedResource: null,
    restrictionChecker: oneActionChecker,
  });

  expect(filtered).toEqual({ [BLOCKED]: false, view_metadata: true });
});

test('the builtin checker blocks nothing, which is what makes the above a test of the seam', async () => {
  // eslint-disable-next-line global-require
  const { checkRestriction } = require('@/authorization/builtin/restrictions');
  const answers = await Promise.all(policyRegistry.listTypes().flatMap((resourceType) => policyRegistry
    .get(resourceType).getActionNames()
    .map((action) => checkRestriction({ resourceType, action, resourceId: dataset.resource_id }))));

  expect(answers.filter(Boolean)).toEqual([]);
  expect(answers.length).toBeGreaterThan(50);
});
