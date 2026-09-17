/**
 * mutatingRouteSweep.test.js
 *
 * Every route bound to a mutating action, read off the router stacks, has a state rule behind it.
 *
 * `authorize()` records the policy it enforces as `middleware.authorizes`, so the stacks can be
 * walked. A route that changes a resource must be refused when that resource's state does not
 * admit the change, and the only way to be sure none was missed is to enumerate them rather
 * than pick a few by hand.
 *
 * This asserts the binding, not one request per route: it names every mutating route and checks
 * that the state layer declares a rule for its action and that an archived or deleted example
 * refuses it. `stateRefusals.test.js` sends the requests for a representative set.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/access-model.md — The state check
 */

const path = require('path');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const state = require('@/state');
const { policyRegistry } = require('@/authorization');
const groupRoutes = require('@/routes/groups');
const collectionRoutes = require('@/routes/collections');
const datasetRoutes = require('@/routes/datasets_v2');
const accessRequestRoutes = require('@/routes/access_requests');
const grantRoutes = require('@/routes/grants');

const ROUTERS = {
  groups: groupRoutes,
  collections: collectionRoutes,
  datasets_v2: datasetRoutes,
  access_requests: accessRequestRoutes,
  grants: grantRoutes,
};

/** Every `{ method, path, resourceType, action }` an `authorize()` call guards. */
function boundRoutes(router, mount) {
  const found = [];
  (router.stack ?? []).forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      layer.route.stack.forEach((handler) => {
        if (handler.handle?.authorizes) {
          found.push({
            route: `${methods.join('/')} ${mount}${layer.route.path}`,
            ...handler.handle.authorizes,
          });
        }
      });
    } else if (layer.handle?.stack) {
      found.push(...boundRoutes(layer.handle, mount));
    }
  });
  return found;
}

const routes = Object.entries(ROUTERS).flatMap(([mount, router]) => boundRoutes(router, `/${mount}`));
const mutating = routes.filter(({ resourceType, action }) => policyRegistry
  .get(resourceType).getRestrictionClass(action) === 'mutating');

test('the sweep found the routes, so the checks below are not vacuous', () => {
  expect(routes.length).toBeGreaterThan(30);
  expect(mutating.length).toBeGreaterThan(10);
  // Forced unless both classes occur: a stack of mutations alone would make the split meaningless.
  expect(routes.length).toBeGreaterThan(mutating.length);
});

test('every mutating route names an action the state layer declares a rule for', () => {
  const missing = mutating
    .filter(({ resourceType, action }) => {
      try {
        state.stateRegistry.get(resourceType).getRule(action);
        return false;
      } catch {
        return true;
      }
    })
    .map(({ route, resourceType, action }) => `${route} → ${resourceType}.${action}`);

  expect(missing).toEqual([]);
});

/**
 * The mutations an archived resource admits on purpose, each with the reason.
 *
 * A route here is a claim about the design, so the test below fails if one of them starts being
 * refused: an entry that no longer matches is as wrong as a missing refusal.
 */
const ADMITTED_WHILE_ARCHIVED = {
  // The way out of the archived state. Refusing it would strand the resource.
  'group.unarchive': 'unarchiving is the way out',
  'collection.unarchive': 'unarchiving is the way out',
  // A root group has no parent, so no archived state reaches its creation. Creating a
  // sub-group under an archived group is `group.create_child`, which is refused.
  'group.create': 'a root group is created under nothing',
  // No access-request step is here. Archiving freezes a request, withdrawing and editing a draft
  // included, so every one of them is refused.
  // @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 2
};

/** The actions a type's archived example refuses. */
const forbiddenWhileArchived = (resourceType) => new Set(state
  .forbiddenActionsOf(resourceType, 'archived').map(({ action }) => action));

test('an archived resource refuses every mutating route bound to it', () => {
  const withArchivedState = mutating
    .filter(({ resourceType }) => state.stateRegistry.get(resourceType).getExampleNames().includes('archived'));

  const admitted = withArchivedState
    .filter(({ resourceType, action }) => !ADMITTED_WHILE_ARCHIVED[`${resourceType}.${action}`]
      && !forbiddenWhileArchived(resourceType).has(action))
    .map(({ route, resourceType, action }) => `${route} → ${resourceType}.${action}`);

  expect(admitted).toEqual([]);
  // Forced unless the sweep reached routes that are refused: an exemption list covering
  // everything would pass the check above while testing nothing.
  const refused = withArchivedState
    .filter(({ resourceType, action }) => forbiddenWhileArchived(resourceType).has(action));
  expect(refused.length).toBeGreaterThan(8);
});

test('every exemption still names a mutation an archived resource admits', () => {
  // A stale exemption hides a refusal somebody added deliberately.
  Object.keys(ADMITTED_WHILE_ARCHIVED).forEach((qualified) => {
    const [resourceType, action] = qualified.split('.');
    const label = `${qualified} listed as admitted`;
    expect([label, forbiddenWhileArchived(resourceType).has(action)]).toEqual([label, false]);
  });
});
