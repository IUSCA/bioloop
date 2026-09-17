/**
 * Running the state rules, and keeping them in step with the policy containers.
 *
 * Every function here is pure: the caller has already fetched the resource. The registry arrives
 * as an argument rather than by import, as the authorization engine takes its restriction checker,
 * so this file stays framework code.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */

const _ = require('lodash/fp');

/** Reads a dotted field path, and says whether it was there at all. */
function readPath(resource, path) {
  const parts = path.split('.');
  let value = resource;
  for (const part of parts) {
    if (value == null || typeof value !== 'object' || !(part in value)) return { found: false };
    value = value[part];
  }
  return { found: true, value };
}

/** Runs one rule on fields already in the rules' form: a shaped row, or an example. */
function checkFields(container, action, fields) {
  const declared = container.getRule(action);
  const missing = declared.requires.filter((path) => !readPath(fields ?? {}, path).found);
  if (missing.length) {
    throw new Error(`The state rule for ${container.meta.resourceType}.${action} reads ${missing.join(', ')}, `
      + 'which the caller did not fetch');
  }
  return declared.check(fields) || null;
}

/**
 * Whether the resource's state admits the action.
 *
 * @param {StateRegistry} registry
 * @param {string} resourceType
 * @param {string} action
 * @param {Object} resource - the row the caller fetched, carrying the rule's required fields
 * @returns {import('./rules').StateRefusal|null} null when the state admits the action
 * @throws {Error} when the resource lacks a field the rule reads
 */
function check(registry, resourceType, action, resource) {
  const container = registry.get(resourceType);
  return checkFields(container, action, container.toStateFields(resource));
}

/**
 * Prisma query arguments with the type's select fragment merged in, the caller's own choices
 * winning where the two name the same key.
 *
 * Under `select` the whole fragment merges. Under `include`, or neither, only the fragment's
 * relations merge, because `include` returns every column and rejects a column named in it.
 *
 * @param {StateRegistry} registry
 * @param {string} resourceType
 * @param {Object} args - the arguments the caller passes to `findUnique`, `findMany`, and so on
 * @returns {Object} new arguments; `args` is not changed
 */
function withStateFields(registry, resourceType, args) {
  const fragment = registry.get(resourceType).getSelect();
  if (args.select) {
    return { ...args, select: _.merge(fragment, args.select) };
  }
  const relations = _.pickBy(_.isPlainObject, fragment);
  return { ...args, include: _.merge(relations, args.include ?? {}) };
}

/**
 * The actions this state admits, whoever asks. The second of the two answers a response carries.
 *
 * @param {StateRegistry} registry
 * @param {string} resourceType
 * @param {Object} resource
 * @returns {string[]} action names, in the container's order
 */
function availableActions(registry, resourceType, resource) {
  const container = registry.get(resourceType);
  const fields = container.toStateFields(resource);
  return container.getActionNames().filter((action) => checkFields(container, action, fields) === null);
}

/**
 * What a named state forbids, with the reason for each action.
 *
 * A dialog asks this before entering the state: archiving a group tells its admin what stops.
 * The answer is the rules run against the row the resource declares for that state, so the
 * dialog and the refusal a service returns come from one statement.
 *
 * @param {StateRegistry} registry
 * @param {string} resourceType
 * @param {string} stateName - a state the container names, such as `archived`
 * @returns {Array<{action: string, message: string}>} in the container's order
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 */
function forbiddenActions(registry, resourceType, stateName) {
  const container = registry.get(resourceType);
  const example = container.getExample(stateName);
  return container.getActionNames()
    .map((action) => ({ action, refusal: checkFields(container, action, example) }))
    .filter(({ refusal }) => refusal !== null)
    .map(({ action, refusal }) => ({ action, message: refusal.message }));
}

/**
 * Every field a resource type's rules read, for a caller building its query.
 *
 * @param {StateRegistry} registry
 * @param {string} resourceType
 * @param {string[]} [actions] - all of them by default
 * @returns {string[]}
 */
function requiredFields(registry, resourceType, actions = null) {
  return registry.get(resourceType).requiredFields(actions);
}

/**
 * Where the two layers disagree. The application throws on any of these at startup, so a renamed
 * action cannot leave a state rule behind or an action unchecked.
 *
 * @param {PolicyRegistry} policyRegistry
 * @param {StateRegistry} stateRegistry
 * @returns {{missingContainers: string[], missingRules: string[], phantomRules: string[]}}
 */
function findStateGaps(policyRegistry, stateRegistry) {
  const missingContainers = [];
  const missingRules = [];
  const phantomRules = [];

  policyRegistry.listTypes().forEach((resourceType) => {
    if (!stateRegistry.has(resourceType)) {
      missingContainers.push(resourceType);
      return;
    }
    const declared = new Set(stateRegistry.get(resourceType).getActionNames());
    policyRegistry.get(resourceType).getActionNames().forEach((action) => {
      if (!declared.has(action)) missingRules.push(`${resourceType}.${action}`);
    });
  });

  stateRegistry.listTypes().forEach((resourceType) => {
    // A standalone container, such as an invitation's, answers for a resource no policy container
    // covers, so its actions are its own.
    if (stateRegistry.get(resourceType).meta.standalone) return;
    if (!policyRegistry.listTypes().includes(resourceType)) {
      phantomRules.push(`${resourceType}.*`);
      return;
    }
    const actions = new Set(policyRegistry.get(resourceType).getActionNames());
    stateRegistry.get(resourceType).getActionNames().forEach((action) => {
      if (!actions.has(action)) phantomRules.push(`${resourceType}.${action}`);
    });
  });

  return { missingContainers, missingRules, phantomRules };
}

module.exports = {
  readPath, check, withStateFields, availableActions, forbiddenActions, requiredFields, findStateGaps,
};
