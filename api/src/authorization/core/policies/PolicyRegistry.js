const PolicyContainer = require('./PolicyContainer');

class PolicyRegistry {
  constructor() {
    this.registry = new Map();
  }

  register(policyContainer) {
    if (!policyContainer || !(policyContainer instanceof PolicyContainer)) {
      throw new Error('Policy container must be an instance of PolicyContainer');
    }
    const { resourceType } = policyContainer.meta;
    if (this.registry.has(resourceType)) {
      throw new Error(`Policy already registered for resource type: ${resourceType}`);
    }

    this.registry.set(resourceType, policyContainer);
  }

  /**
   * Every registered resource type, in registration order. Completeness checks iterate this
   * rather than a literal list, so a container a derived app registers is covered without
   * editing the check.
   * @returns {string[]}
   */
  listTypes() {
    return Array.from(this.registry.keys());
  }

  get(resourceType) {
    const policyContainer = this.registry.get(resourceType);
    if (!policyContainer) {
      throw new Error(
        `No policies registered for resource type: ${resourceType}. Register at src/authorization/index.js`,
      );
    }
    return policyContainer;
  }
}

module.exports = PolicyRegistry;
