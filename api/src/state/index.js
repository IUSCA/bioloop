const createError = require('http-errors');

const StateContainer = require('./core/StateContainer');
const StateRegistry = require('./core/StateRegistry');
const engine = require('./core/engine');
const rules = require('./core/rules');

const { groupState } = require('./builtin/group');
const { collectionState } = require('./builtin/collection');
const { datasetState } = require('./builtin/dataset');
const { accessRequestState } = require('./builtin/access_request');
const { grantState } = require('./builtin/grant');
const { invitationState } = require('./builtin/invitation');
const { userState } = require('./builtin/user');
const { auditState } = require('./builtin/audit');

/**
 * The state layer: whether a resource's current state admits an action.
 *
 * Authorization answers what a caller could do. This answers what the resource admits, and the two
 * are separate layers: a service asks this inside its transaction, after its row lock, and a
 * refusal is a 409 rather than a 403.
 *
 * Which actions a state admits is business logic, so each resource type declares its own rules
 * under `builtin/`. `core/` only holds them, runs them, and reports where they and the policy
 * containers disagree. A derived app registers its containers in section 2 below.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

// ============================================================================
// SECTION 1: BUILTIN STATE CONTAINERS
// ============================================================================
const stateRegistry = new StateRegistry();
stateRegistry.register(groupState);
stateRegistry.register(collectionState);
stateRegistry.register(datasetState);
stateRegistry.register(accessRequestState);
stateRegistry.register(grantState);
stateRegistry.register(invitationState);
stateRegistry.register(userState);
stateRegistry.register(auditState);

// ============================================================================
// SECTION 2: CUSTOM STATE CONTAINERS (derived app code)
// ============================================================================

/**
 * Whether the resource's state admits the action.
 * @param {string} resourceType
 * @param {string} action
 * @param {Object} resource - the row the caller fetched, carrying the fields the rule reads
 * @returns {import('./core/rules').StateRefusal|null}
 */
const checkOf = (resourceType, action, resource) => engine.check(stateRegistry, resourceType, action, resource);

/**
 * The Prisma select fragment a caller merges into its own query, so the row it fetches carries
 * what this type's rules read.
 * @param {string} resourceType
 * @returns {Object}
 * @throws {Error} when the type declares no fragment
 */
const selectOf = (resourceType) => stateRegistry.get(resourceType).getSelect();

/**
 * Prisma query arguments with the type's select fragment merged in.
 * @param {string} resourceType
 * @param {Object} args - `{ where, select }` or `{ where, include }`
 * @returns {Object}
 */
const withStateFieldsOf = (resourceType, args) => engine.withStateFields(stateRegistry, resourceType, args);

/**
 * Refuses, with 409, an action the resource's state does not admit.
 *
 * Call it inside the transaction that performs the action, with the row fetched after the row
 * lock, so the state it reads is the state the write sees. A platform admin is refused the same
 * way, because this is not an authorization check.
 *
 * @param {string} resourceType
 * @param {string} action
 * @param {Object} resource
 * @throws {HttpError} 409 when the state refuses the action
 * @throws {Error} when the row lacks a field the rule reads
 */
function assertPossibleOf(resourceType, action, resource) {
  const refusal = checkOf(resourceType, action, resource);
  if (refusal) throw createError.Conflict(refusal.message);
}

/**
 * The actions this state admits, for `_meta.available_actions`.
 * @param {string} resourceType
 * @param {Object} resource
 * @returns {string[]}
 */
const availableActionsOf = (resourceType, resource) => engine.availableActions(stateRegistry, resourceType, resource);

/**
 * What a named state forbids, for the dialog that confirms entering it.
 * @param {string} resourceType
 * @param {string} stateName - a state the resource's container names, such as `archived`
 * @returns {Array<{action: string, message: string}>}
 * @throws {Error} when the container names no such state
 */
const forbiddenActionsOf = (resourceType, stateName) => engine
  .forbiddenActions(stateRegistry, resourceType, stateName);

/**
 * Every field a resource type's rules read, so a caller can fetch them in one query.
 * @param {string} resourceType
 * @param {string[]} [actions]
 * @returns {string[]}
 */
const requiredFieldsOf = (resourceType, actions = null) => engine
  .requiredFields(stateRegistry, resourceType, actions);

/**
 * The functions above with the resource type already supplied, for a module that works with one
 * type. Each drops the `Of` suffix along with the type argument.
 *
 * @example
 * const { assertPossible, withStateFields } = require('@/state').import('collection');
 * assertPossible('edit_metadata', row);
 *
 * @param {string} resourceType
 * @returns {{check: Function, assertPossible: Function, availableActions: Function,
 *   forbiddenActions: Function, requiredFields: Function, select: Function, withStateFields: Function}}
 * @throws {Error} when no state container is registered for the type, so a typo fails at require time
 */
function importFor(resourceType) {
  stateRegistry.get(resourceType);
  return Object.freeze({
    check: (action, resource) => checkOf(resourceType, action, resource),
    assertPossible: (action, resource) => assertPossibleOf(resourceType, action, resource),
    availableActions: (resource) => availableActionsOf(resourceType, resource),
    forbiddenActions: (stateName) => forbiddenActionsOf(resourceType, stateName),
    requiredFields: (actions = null) => requiredFieldsOf(resourceType, actions),
    select: () => selectOf(resourceType),
    withStateFields: (args) => withStateFieldsOf(resourceType, args),
  });
}

/**
 * Throws unless every action a policy container declares has a state rule, and every rule names
 * an action some container declares.
 *
 * A mismatch is a renamed action whose state check was silently dropped, so `src/index.js` calls
 * this at startup and the API refuses to start. It is a call rather than a check at module load,
 * because the authorization registry is read here and a service that requires this module must not
 * depend on which of the two loaded first.
 *
 * @throws {Error} naming every disagreement
 */
function verifyInSync() {
  // eslint-disable-next-line global-require
  const { policyRegistry } = require('@/authorization');

  const gaps = engine.findStateGaps(policyRegistry, stateRegistry);
  const reported = Object.entries(gaps).filter(([, list]) => list.length);
  if (reported.length) {
    throw new Error(`The state rules and the policy containers disagree:\n  ${
      reported.map(([kind, list]) => `${kind}: ${list.join(', ')}`).join('\n  ')}`);
  }
}

module.exports = {
  // The application's layer
  stateRegistry,
  import: importFor,
  checkOf,
  selectOf,
  withStateFieldsOf,
  assertPossibleOf,
  availableActionsOf,
  forbiddenActionsOf,
  requiredFieldsOf,
  verifyInSync,

  // The framework, for a test or a derived app
  StateContainer,
  StateRegistry,
  engine,
  ...rules,
};
