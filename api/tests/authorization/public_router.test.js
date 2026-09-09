/**
 * public_router.test.js
 *
 * The public router is the only code reachable without a token, so its shape is asserted
 * rather than trusted. Three properties, each the kind a later edit removes by accident:
 * every route is a GET, every route authorizes `view_profile`, and the router is mounted
 * above the line in `routes/index.js` that requires authentication.
 *
 * @see docs/design/groups/profiles.md — API
 */

const path = require('path');
const fs = require('fs');

global.__basedir = path.join(__dirname, '..', '..');
require('module-alias/register');

const publicRoutes = require('@/routes/public');

/** Every route layer on a router, as { methods, path, policies }. */
function routesOf(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
      policies: layer.route.stack
        .map((s) => s.handle?.authorizes)
        .filter(Boolean)
        .map(({ resourceType, action }) => `${resourceType}.${action}`),
    }));
}

const routes = routesOf(publicRoutes);

describe('the public router', () => {
  test('has routes at all, so an empty stack cannot pass the rest of this file', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  test('serves nothing but GET', () => {
    const offenders = routes
      .filter((r) => r.methods.some((m) => m !== 'get'))
      .map((r) => `${r.methods.join(',')} ${r.path}`);
    expect(offenders).toEqual([]);
  });

  test('authorizes view_profile on every route', () => {
    const offenders = routes
      .filter((r) => !r.policies.every((p) => p.endsWith('.view_profile')))
      .map((r) => `${r.path} -> ${r.policies.join(', ') || '(nothing)'}`);
    expect(offenders).toEqual([]);
  });

  test('binds a policy on every route, so none is unguarded', () => {
    const unguarded = routes.filter((r) => r.policies.length === 0).map((r) => r.path);
    expect(unguarded).toEqual([]);
  });
});

describe('where the router is mounted', () => {
  const indexSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'index.js'),
    'utf8',
  );

  test('the public router is registered before authentication is required', () => {
    const mount = indexSource.indexOf("router.use('/public'");
    const authLine = indexSource.indexOf('router.use(authenticate)');

    expect(mount).toBeGreaterThan(-1);
    expect(authLine).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(authLine);
  });

  test('no other router is mounted above the authentication line by accident', () => {
    // The public surface is meant to be enumerable. Anything else that appears above the
    // line is a deliberate decision somebody should have to make in this test too.
    const authLine = indexSource.indexOf('router.use(authenticate)');
    const above = indexSource.slice(0, authLine);
    const mounted = [...above.matchAll(/router\.use\('(\/[^']*)'/g)].map((m) => m[1]);

    expect(mounted.sort()).toEqual(['/about', '/auth', '/env', '/public', '/reports']);
  });
});
