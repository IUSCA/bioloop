const { expect } = require('@playwright/test');
const { REFUSALS } = require('./parity');

/**
 * Record the API calls a page makes for someone allowed to see it, then replay each one as
 * someone who is not.
 *
 * This is how flow N1 is asserted without an inventory of routes. N1 says every surface must
 * agree about one dataset, and names "any programmatic route the browser itself calls" — a
 * list nobody can write down accurately, because it changes whenever a component adds a
 * fetch. Recording it from the running page keeps the list correct by construction: a new
 * call the page starts making is a new call the stranger is tested against, with no edit
 * here.
 *
 * The failure this catches is the one N1 was written for. A page can hide every control and
 * still serve the data, because the guard on the page and the guard on the route are two
 * different pieces of code. Asserting only that the page looks empty passes just as happily
 * against a build where the server stopped checking.
 *
 * @see docs/design/groups/e2e-test-flows.md — N1
 */

/** Only the application's own API is replayed. Assets and HMR traffic are not access checks. */
function isApiCall(url) {
  return /\/api\//.test(url) || /:3030\//.test(url);
}

/**
 * Calls a page is expected to make regardless of who is looking, and which therefore say
 * nothing about one caller's access to one resource.
 *
 * `users/me` and the notification and alert pollers answer for the caller themselves, so a
 * stranger is *supposed* to be allowed them. Replaying those would assert that a signed-in
 * user cannot read their own identity, which is the opposite of the model.
 */
const CALLER_SCOPED = [
  /\/v2\/users\/me\b/,
  /\/notifications\b/,
  /\/alerts\b/,
  /\/env\b/,
  /\/about\b/,
  // Answers "which groups am I in". Verified against the running API: a caller with no
  // memberships gets an empty list, so the reply is about the caller and never about the
  // resource whose page happened to ask.
  /\/groups\/search\b/,
  // Answers "have I already asked for this". Verified the way that matters: a real
  // resource id and an id that was never issued return byte-identical replies
  // (`{"metadata":{"total":0,...},"data":[]}`), so a stranger learns nothing about whether
  // the resource exists.
  /\/access-requests\/requested-by-me\b/,
];

/**
 * Every entry above is an exemption, and an exemption is how a test like this quietly stops
 * testing anything. Before adding one, show that the route answers about the *caller* rather
 * than about the resource: call it as a stranger with a real id and with an id that was never
 * issued, and require the two replies to be indistinguishable. Record what you ran. An
 * exemption added because a spec was red is a hole, not a fix.
 */

function isCallerScoped(url) {
  return CALLER_SCOPED.some((re) => re.test(url));
}

/**
 * Drives `visit` with the page's network recorded, and returns the distinct API calls it made.
 *
 * Only successful calls are returned. A call that already failed for the permitted caller
 * proves nothing when it fails again for the stranger, and including it would let a broken
 * endpoint masquerade as an enforced one.
 */
async function recordApiCalls(ctx, visit) {
  const seen = new Map();

  const onResponse = (response) => {
    const url = response.url();
    const request = response.request();
    if (!isApiCall(url) || isCallerScoped(url)) return;
    if (response.status() >= 400) return;
    const key = `${request.method()} ${url}`;
    if (!seen.has(key)) {
      seen.set(key, { method: request.method(), url, postData: request.postData() });
    }
  };

  ctx.page.on('response', onResponse);
  try {
    await visit(ctx.page);
  } finally {
    ctx.page.off('response', onResponse);
  }
  return [...seen.values()];
}

/** Strip the origin, so a recorded call can be reissued through another persona's client. */
function toPath(url) {
  const { pathname, search } = new URL(url);
  return pathname.replace(/^\/api\b/, '') + search;
}

/**
 * Asserts every recorded call is refused for `stranger`.
 *
 * Reports all failures at once rather than stopping at the first. A single refused call tells
 * you little; the whole list tells you which surface disagrees with the others, which is what
 * N1 is actually about.
 */
async function expectAllRefused(stranger, calls) {
  expect(calls.length, 'no API calls were recorded — the page never loaded').toBeGreaterThan(0);

  const results = [];
  for (const call of calls) {
    const path = toPath(call.url);
    let body;
    if (call.postData) {
      try { body = JSON.parse(call.postData); } catch { body = undefined; }
    }
    // eslint-disable-next-line no-await-in-loop
    const status = await stranger.api.status(call.method, path, body);
    results.push({ call: `${call.method} ${path}`, status });
  }

  const allowed = results.filter((r) => !REFUSALS.includes(r.status));
  expect(
    allowed.map((r) => `${r.call} -> ${r.status}`),
    'these calls the page makes were NOT refused for a caller with no access',
  ).toEqual([]);

  return results;
}

module.exports = { recordApiCalls, expectAllRefused, toPath, isApiCall, isCallerScoped };
