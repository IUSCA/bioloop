const createError = require('http-errors');

const { policyRegistry } = require('@/authorization');

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
const targets = require('./builtin/targets');

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
const check = (resourceType, action, resource) => engine.check(stateRegistry, resourceType, action, resource);

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
function assertPossible(resourceType, action, resource) {
  const refusal = check(resourceType, action, resource);
  if (refusal) throw createError.Conflict(refusal.message);
}

/**
 * The actions this state admits, for `_meta.available_actions`.
 * @param {string} resourceType
 * @param {Object} resource
 * @returns {string[]}
 */
const availableActions = (resourceType, resource) => engine.availableActions(stateRegistry, resourceType, resource);

/**
 * Every field a resource type's rules read, so a caller can fetch them in one query.
 * @param {string} resourceType
 * @param {string[]} [actions]
 * @returns {string[]}
 */
const requiredFields = (resourceType, actions = null) => engine.requiredFields(stateRegistry, resourceType, actions);

// Every action a policy container declares must have a state rule, and no rule may name an action
// nothing declares. A mismatch is a renamed action with its state check silently dropped, so it
// fails here, at startup, rather than as a missing refusal in production.
const gaps = engine.findStateGaps(policyRegistry, stateRegistry);
const reported = Object.entries(gaps).filter(([, list]) => list.length);
if (reported.length) {
  throw new Error(`The state rules and the policy containers disagree:\n  ${
    reported.map(([kind, list]) => `${kind}: ${list.join(', ')}`).join('\n  ')}`);
}

module.exports = {
  // The application's layer
  stateRegistry,
  check,
  assertPossible,
  availableActions,
  requiredFields,
  ...targets,

  // The framework, for a test or a derived app
  StateContainer,
  StateRegistry,
  engine,
  ...rules,
};
