/**
 * route_policy_bindings.test.js
 *
 * Which policy each route enforces, read back off the router stack.
 *
 * An `authorize()` call naming the wrong action is a live enforcement hole that reads as
 * correct, and one shipped: `POST /groups/:id/unarchive` bound `group.archive`, so a group
 * admin could take back the authority archiving gives up. The policy container had
 * `unarchive: platformAdminOnly` all along and nothing reached it.
 *
 * @see .todo/local/L1-authorization-enforcement.md — T3
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const groupRoutes = require('@/routes/groups');
const collectionRoutes = require('@/routes/collections');
const datasetRoutes = require('@/routes/datasets_v2');

/**
 * The policies bound to one route of a router, as `resourceType.action` strings.
 * Returns null when the router has no such route, so a renamed path fails loudly.
 */
function policiesFor(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route?.path === routePath && l.route?.methods?.[method],
  );
  if (!layer) return null;
  return layer.route.stack
    .map((s) => s.handle?.authorizes)
    .filter(Boolean)
    .map(({ resourceType, action }) => `${resourceType}.${action}`);
}

describe('archiving and unarchiving are separate authorities', () => {
  // Archiving gives up governance authority and the resource's own admin may do it.
  // Unarchiving takes that authority back, so on groups and collections it is platform
  // admin only. Binding one action to both routes silently drops the second rule.
  test.each([
    ['group', groupRoutes],
    ['collection', collectionRoutes],
  ])('%s archive and unarchive do not share a policy', (resourceType, router) => {
    const archive = policiesFor(router, 'post', '/:id/archive');
    const unarchive = policiesFor(router, 'post', '/:id/unarchive');

    expect(archive).toEqual([`${resourceType}.archive`]);
    expect(unarchive).toEqual([`${resourceType}.unarchive`]);
  });

  test('a dataset is the exception, and says so in its policies', () => {
    // Both are isDatasetOwningGroupAdmin, so the dataset archive route may bind either.
    // The point is that the policy container decides, not the route.
    const { datasetPolicies } = require('@/authorization/builtin/policies/dataset');
    expect(datasetPolicies.hasAction('archive')).toBe(true);
    expect(datasetPolicies.hasAction('unarchive')).toBe(true);
    expect(policiesFor(datasetRoutes, 'post', '/:id/archive')).toEqual(['dataset.archive']);
  });
});

describe('every authorize() on these routers names a real action', () => {
  test.each([
    ['groups', groupRoutes],
    ['collections', collectionRoutes],
    ['datasets_v2', datasetRoutes],
  ])('%s', (_name, router) => {
    const { policyRegistry } = require('@/authorization');

    const bound = router.stack
      .filter((l) => l.route)
      .flatMap((l) => l.route.stack.map((s) => s.handle?.authorizes).filter(Boolean));

    // The routers under test do bind policies; an empty list would make this vacuous.
    expect(bound.length).toBeGreaterThan(0);

    for (const { resourceType, action } of bound) {
      expect(policyRegistry.get(resourceType).hasAction(action)).toBe(true);
    }
  });
});
