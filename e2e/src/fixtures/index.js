const base = require('@playwright/test');
const { buildWorld } = require('../world/build');
const { teardownWorld } = require('../world/teardown');
const { withWorldBuildLock } = require('../world/db');
const { signIn, clientFor } = require('../world/api');

/**
 * The fixtures every spec builds on: a fixture world per worker, and a signed-in browser
 * context per person.
 *
 * @see docs/design/groups/e2e-test-flows.md — How the suite builds its world
 */

/**
 * A run identifier unique to this worker.
 *
 * Each worker builds its own world so the suite can run in parallel without two specs
 * mutating the same group. Building costs a few hundred milliseconds, which is cheap enough
 * that sharing one world is not worth the interference it would allow.
 */
function runIdFor(workerInfo) {
  return `w${workerInfo.workerIndex}-${process.pid}`;
}

const test = base.test.extend({
  /**
   * The fixture world, built once per worker and removed when the worker finishes.
   *
   * Teardown runs even when a spec fails, because a run that leaves rows behind makes the
   * next run's name collide. A teardown that itself throws is reported rather than
   * swallowed: silently leaving rows is how a database fills with fixtures nobody can
   * attribute.
   */
  world: [async ({}, use, workerInfo) => { // eslint-disable-line no-empty-pattern
    const runId = runIdFor(workerInfo);
    // One worker builds at a time. Both the clear and the build are inside the lock, because
    // the accounts a world borrows are chosen by reading which users belong to no group, and
    // two builds overlapping there hand both workers the same people.
    const world = await withWorldBuildLock(async () => {
      // A previous run killed mid-flight leaves rows under this same worker id. Clear them
      // before building, or the group names collide.
      await teardownWorld(runId);
      return buildWorld(runId);
    });
    await use(world);
    await teardownWorld(runId);
  }, { scope: 'worker' }],

  /**
   * `as('alice')` gives a browser page signed in as that person, plus an API client holding
   * the same identity, so a spec can assert that a hidden control is also refused by the
   * route behind it.
   *
   * Sign-in is a navigation to the development login page rather than a hand-built
   * `storageState`. The page runs the application's own `onLogin`, so the suite never has to
   * know which keys the auth store persists or how it shapes them. It costs about a second
   * per persona; if a run ever gets slow enough to care, mint the state once per worker and
   * reuse it, rather than reproducing the store's format here.
   */
  as: async ({ world, browser }, use) => {
    const contexts = [];

    async function signInAs(personKey, startPath = '/v2/groups') {
      const person = world.people[personKey];
      if (!person) {
        throw new Error(
          `No person named '${personKey}'. Known: ${Object.keys(world.people).join(', ')}`,
        );
      }

      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      contexts.push(context);
      const page = await context.newPage();

      await page.goto(
        `/dev-login?username=${encodeURIComponent(person.username)}`
        + `&next=${encodeURIComponent(startPath)}`,
      );
      // dev-login redirects itself once the token is stored.
      await page.waitForURL((url) => !url.pathname.startsWith('/dev-login'), { timeout: 30_000 });

      const { token } = await signIn(person.username);
      return {
        person, page, context, api: clientFor(token),
      };
    }

    await use(signInAs);

    await Promise.all(contexts.map((c) => c.close()));
  },
});

module.exports = { test, expect: base.expect };
