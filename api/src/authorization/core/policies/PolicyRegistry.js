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

  get(resourceType) {
    const policyContainer = this.registry.get(resourceType);
    if (!policyContainer) {
      throw new Error(`No policy registered for resource type: ${resourceType}`);
    }
    return policyContainer;
  }
}

module.exports = PolicyRegistry;
