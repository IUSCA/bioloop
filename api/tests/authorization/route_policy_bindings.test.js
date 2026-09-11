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
const auditRoutes = require('@/routes/audit');
const { auditPolicies } = require('@/authorization/builtin/policies/audit');

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

describe('a resource audit tab reads its own resource, not the platform log', () => {
  // The three audit tabs used to call `GET /audit/records`, which is platform-admin only,
  // so an owning-group admin was shown a tab that answered 403. Each resource now has its
  // own endpoint bound to its own `view_audit_logs` policy.
  //
  // @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
  test.each([
    ['group', groupRoutes],
    ['collection', collectionRoutes],
    ['dataset', datasetRoutes],
  ])('%s audit records are bound to view_audit_logs', (resourceType, router) => {
    expect(policiesFor(router, 'get', '/:id/audit')).toEqual([`${resourceType}.view_audit_logs`]);
  });

  test('the platform-wide log stays platform admin only', () => {
    expect(policiesFor(auditRoutes, 'get', '/records')).toEqual(['audit.read_records']);

    // Registration renames a policy to `<resourceType>.<action>`, so identity against
    // `platformAdminOnly` cannot be asserted. Assert what it does instead: nobody passes it
    // on their own, and only the engine's platform-admin short-circuit gets through.
    return expect(
      auditPolicies.getPolicy('read_records').evaluate({}, {}, {}),
    ).resolves.toBe(false);
  });
});
