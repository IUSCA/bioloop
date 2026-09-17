/**
 * Lifecycle hooks.
 *
 * A generic extension point, so that a module can react to something happening elsewhere
 * without the place it happens knowing that module exists. `services/user.js` runs
 * `USER_CREATED` and names nothing; the invitations service registers against it.
 *
 * There is nothing clever here on purpose. Handlers run in registration order, one after
 * another, and a handler that throws stops the rest and propagates. That last part is the
 * point rather than an oversight: a handler runs inside the caller's transaction, so a
 * failure has to take the whole thing down instead of leaving half of it committed.
 *
 * @see docs/design/groups/invitations.md — Why it is shaped this way
 */

/** An account has just been created. Payload: `{ user, tx }`. */
const USER_CREATED = 'user_created';

const handlers = new Map();

/**
 * Register a handler for an event.
 *
 * @param {string} event
 * @param {(payload: object) => Promise<void>} handler
 */
function on(event, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(`Hook handler for '${event}' must be a function`);
  }
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(handler);
}

/**
 * Run every handler registered for an event, in order.
 *
 * @param {string} event
 * @param {object} payload
 * @returns {Promise<void>}
 */
async function run(event, payload) {
  for (const handler of handlers.get(event) ?? []) {
    // Sequential on purpose: handlers share the caller's transaction client, and a Prisma
    // interactive transaction is a single connection that cannot serve parallel queries.
    // eslint-disable-next-line no-await-in-loop
    await handler(payload);
  }
}

/** How many handlers an event has. For tests, and for asserting the wiring is really there. */
function count(event) {
  return (handlers.get(event) ?? []).length;
}

/** Drop every handler for an event. For tests. */
function clear(event) {
  handlers.delete(event);
}

module.exports = {
  USER_CREATED, on, run, count, clear,
};
