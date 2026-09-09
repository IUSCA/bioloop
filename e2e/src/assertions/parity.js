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

module.exports = {
  REFUSALS, expectRefused, expectAllowed, expectAbsentButPresent,
};
