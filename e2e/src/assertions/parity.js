const { expect } = require('@playwright/test');

/**
 * The assertion that makes the boundary suite worth anything: a control the page hides must
 * also be refused by the route behind it.
 *
 * Hiding a button is a courtesy. The refusal is the security property, and a suite that only
 * checks the page passes just as happily against a build where the server stopped checking.
 *
 * @see docs/design/groups/e2e-test-flows.md — N3
 */

/** Statuses that count as a refusal. */
const REFUSALS = [401, 403, 404];

/**
 * Asserts the API refuses this call for this caller.
 *
 * A 404 counts, and is often the better answer: a 403 on a resource the caller cannot see
 * confirms that it exists, which zero-default access exists to prevent.
 */
async function expectRefused(api, method, url, body) {
  const status = await api.status(method, url, body);
  expect(
    REFUSALS,
    `expected ${method} ${url} to be refused, got ${status}`,
  ).toContain(status);
  return status;
}

/** Asserts the API allows this call for this caller. */
async function expectAllowed(api, method, url, body) {
  const status = await api.status(method, url, body);
  expect(
    status,
    `expected ${method} ${url} to be allowed, got ${status}`,
  ).toBeLessThan(400);
  return status;
}

/**
 * Asserts something is absent from a page, and — on the same page — that something expected
 * is present.
 *
 * The pairing is not decoration. An absence assertion passes for the wrong reason whenever
 * the page failed to load, the selector was mistyped, or the caller was never signed in. The
 * positive half is what separates "correctly hidden" from "never got here".
 *
 * @see docs/design/groups/e2e-test-flows.md — How to read a flow
 */
async function expectAbsentButPresent({ absent, present }) {
  await expect(present, 'the paired positive assertion failed: the page did not render as expected')
    .toBeVisible();
  await expect(absent).toHaveCount(0);
}

/**
 * Asserts the refusal came from *authorization* specifically, not from a broken or missing
 * route.
 *
 * `expectRefused` accepts 401, 403, and 404, which is right for a surface whose whole job is
 * to be indistinguishable from "no such thing". It is too loose where the point is that the
 * policy engine is what said no: a route that 404s for everybody, or one that was never
 * mounted, satisfies it while enforcing nothing. Measured here: `/v2/datasets/:id/files`
 * returned 404 to a platform admin because the fixture dataset holds no file rows, so a
 * refusal test written with the looser helper passed for that reason alone.
 *
 * That particular 404 is gone — an empty dataset now lists as empty — but the rule it
 * taught stands, so keep asserting 403 exactly. The next route to answer a blanket 404
 * would otherwise slip through the same way.
 */
async function expectForbidden(api, method, url, body) {
  const status = await api.status(method, url, body);
  // A 400 means express-validator rejected the payload and the policy never ran, so the call
  // proves nothing about authorization. Four specs in this suite were written with a
  // malformed body and refused for that reason; naming it here is what stopped them being
  // read as enforcement.
  expect(
    status,
    `${method} ${url} was rejected by validation (400) before authorization ran. `
    + 'Fix the request body or params — this call is not testing the policy.',
  ).not.toBe(400);
  expect(
    status,
    `expected ${method} ${url} to be refused by authorization (403), got ${status}`,
  ).toBe(403);
  return status;
}

/**
 * Asserts authorization did *not* refuse this caller, without requiring the call to succeed.
 *
 * The pair to `expectForbidden`, and the only honest positive control where the handler
 * behind the policy cannot answer for reasons of its own. The file listing and tree routes
 * now answer 200 with nothing in them for an empty dataset, but the download planes still
 * refuse a dataset that is not staged; insisting on a 2xx would make the spec fail for
 * something it is not testing.
 */
async function expectNotForbidden(api, method, url, body) {
  const status = await api.status(method, url, body);
  expect(
    status,
    `expected ${method} ${url} to pass authorization, but it answered 403`,
  ).not.toBe(403);
  return status;
}

module.exports = {
  REFUSALS,
  expectRefused,
  expectAllowed,
  expectForbidden,
  expectNotForbidden,
  expectAbsentButPresent,
};
