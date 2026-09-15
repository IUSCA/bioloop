const StateContainer = require('./StateContainer');

/**
 * The state containers, by resource type. Framework code, so completeness checks iterate
 * `listTypes()` rather than a literal list and a derived app's container is covered too.
 *
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 1: the state layer
 */
class StateRegistry {
  constructor() {
    this.registry = new Map();
  }

  register(stateContainer) {
    if (!(stateContainer instanceof StateContainer)) {
      throw new Error('A state container must be an instance of StateContainer');
    }
    const { resourceType } = stateContainer.meta;
    if (this.registry.has(resourceType)) {
      throw new Error(`State rules are already registered for resource type: ${resourceType}`);
    }
    if (!stateContainer.isFrozen()) {
      throw new Error(`The state container for ${resourceType} declared no rules`);
    }
    this.registry.set(resourceType, stateContainer);
  }

  /** @returns {string[]} every registered resource type, in registration order */
  listTypes() {
    return Array.from(this.registry.keys());
  }

  has(resourceType) {
    return this.registry.has(resourceType);
  }

  get(resourceType) {
    const container = this.registry.get(resourceType);
    if (!container) {
      throw new Error(`No state rules registered for resource type: ${resourceType}. `
        + 'Register at src/state/index.js');
    }
    return container;
  }
}

module.exports = StateRegistry;
