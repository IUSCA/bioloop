/**
 * PolicyContainer - A singleton container for managing resource policies
 * Automatically names policies based on resource type and action names
 */
class PolicyContainer {
  constructor({ resourceType, version = '1.0.0', description = '' }) {
    this.meta = {
      resourceType,
      version,
      description,
    };
    this._actions = {};
    this._frozen = false;
  }

  /**
   * Register a single action with its policy
   * Automatically names the policy as {resourceType}.{actionName}
   */
  action(actionName, policy, renamePolicy = true) {
    if (this._frozen) {
      throw new Error(`PolicyContainer for ${this.meta.resourceType} is frozen. Cannot register new actions.`);
    }

    const qualifiedName = `${this.meta.resourceType}.${actionName}`;
    this._actions[actionName] = renamePolicy ? policy.cloneWithName(qualifiedName) : policy.clone();
    return this;
  }

  /**
   * Register multiple actions at once
   * @param {Object} actionsMap - Object with action names as keys and policies as values
   */
  actions(actionsMap, renamePolicies = true) {
    Object.entries(actionsMap).forEach(([actionName, policy]) => {
      this.action(actionName, policy, renamePolicies);
    });
    return this;
  }

  /**
   * Get a specific action policy
   */
  getAction(actionName) {
    const policy = this._actions[actionName];
    if (!policy) {
      throw new Error(`Action '${actionName}' not found in '${this.meta.resourceType}' policies`);
    }
    return policy;
  }

  /**
   * Check if an action exists
   */
  hasAction(actionName) {
    return actionName in this._actions;
  }

  /**
   * Get all action names
   */
  getActionNames() {
    return Object.keys(this._actions);
  }

  /**
   * Freeze the container to prevent further modifications
   */
  freeze() {
    this._frozen = true;
    Object.freeze(this._actions);
    Object.freeze(this.meta);
    return this;
  }

  /**
   * Export as a plain object for external use (e.g., by authorization middleware)
   */
  export() {
    return {
      meta: { ...this.meta },
      actions: { ...this._actions },
    };
  }
}

module.exports = PolicyContainer;
