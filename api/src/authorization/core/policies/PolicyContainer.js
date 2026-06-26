const Policy = require('./Policy');

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
    this._attributeRules = {};
    this._roles = [];
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
   * Register attribute filtering rules for actions
   * Rules are evaluated in order - first matching policy wins (short-circuit)
   * Action-specific rules take precedence; '*' serves as fallback for any action
   *
   * @param {Object} rulesMap - Object mapping action names to arrays of rule objects
   * @param {string} rulesMap.actionName - Action name or '*' for all actions
   * @param {Array} rulesMap.actionName[] - Array of rule objects
   * @param {Policy} rulesMap.actionName[].policy - Policy to evaluate for this rule
   * @param {string[]} rulesMap.actionName[].attribute_filters - Array of attributes to include
   *                                                              Supports '*' for all attributes
   *                                                              Supports '!field' for exclusions
   * @returns {PolicyContainer} this for chaining
   *
   * @example
   * container.attributes({
   *   '*': [{
   *     policy: isAuthenticated,
   *     attribute_filters: ['id', 'name', 'email']
   *   }, {
   *     policy: isAdmin,
   *     attribute_filters: ['*'] // all attributes
   *   }],
   *   'view_sensitive': [{
   *     policy: hasSpecialAccess,
   *     attribute_filters: ['*', '!ssn'] // all except ssn
   *   }]
   * })
   */
  attributes(rulesMap) {
    if (this._frozen) {
      throw new Error(`PolicyContainer for ${this.meta.resourceType} is frozen. Cannot register attribute rules.`);
    }

    if (!rulesMap || typeof rulesMap !== 'object') {
      throw new Error('Attribute rules must be an object');
    }

    // Validate each action's rules
    Object.entries(rulesMap).forEach(([actionName, rules]) => {
      if (!Array.isArray(rules)) {
        throw new Error(`Attribute rules for action '${actionName}' must be an array`);
      }

      if (rules.length === 0) {
        throw new Error(`Attribute rules for action '${actionName}' cannot be empty`);
      }

      rules.forEach((rule, index) => {
        if (!rule || typeof rule !== 'object') {
          throw new Error(`Rule at index ${index} for action '${actionName}' must be an object`);
        }

        if (!rule.policy || !(rule.policy instanceof Policy)) {
          throw new Error(
            `Rule at index ${index} for action '${actionName}' must have a 'policy' `
            + 'that is a Policy instance',
          );
        }

        // Validate policy resourceType matches container resourceType
        if (rule.policy.resourceType !== null && rule.policy.resourceType !== this.meta.resourceType) {
          throw new Error(
            `Rule at index ${index} for action '${actionName}': `
            + `policy resourceType '${rule.policy.resourceType}' `
            + `does not match container resourceType '${this.meta.resourceType}'`,
          );
        }

        if (!Array.isArray(rule.attribute_filters)) {
          throw new Error(
            `Rule at index ${index} for action '${actionName}' `
            + "must have 'attribute_filters' as an array",
          );
        }

        if (rule.attribute_filters.length === 0) {
          throw new Error(
            `Rule at index ${index} for action '${actionName}' `
            + 'must have at least one attribute filter',
          );
        }

        rule.attribute_filters.forEach((filter, filterIndex) => {
          if (typeof filter !== 'string') {
            throw new Error(
              `Rule at index ${index} for action '${actionName}': `
              + `attribute_filters[${filterIndex}] must be a string`,
            );
          }
        });
      });

      // Store the rules for this action
      this._attributeRules[actionName] = rules;
    });

    return this;
  }

  /**
   * Register caller role derivation rules.
   * Each entry maps a policy to the role assigned to the caller when that policy evaluates to true.
   * Rules are evaluated in order; multiple roles may be assigned (all matching policies apply).
   *
   * @param {Array<{policy: Policy, role: string}>} rolesArray
   * @returns {PolicyContainer} this for chaining
   *
   * @example
   * container.roles([
   *   { policy: isPlatformAdmin, role: CallerRole.PLATFORM_ADMIN },
   *   { policy: isGroupAdmin,    role: CallerRole.ADMIN },
   * ])
   */
  roles(rolesArray) {
    if (this._frozen) {
      throw new Error(`PolicyContainer for ${this.meta.resourceType} is frozen. Cannot register caller roles.`);
    }

    if (!Array.isArray(rolesArray) || rolesArray.length === 0) {
      throw new Error('Caller roles must be a non-empty array');
    }

    rolesArray.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Caller role entry at index ${index} must be an object`);
      }
      if (!entry.policy || !(entry.policy instanceof Policy)) {
        throw new Error(
          `Caller role entry at index ${index} must have a 'policy' that is a Policy instance`,
        );
      }
      if (typeof entry.role !== 'string' || !entry.role) {
        throw new Error(`Caller role entry at index ${index} must have a non-empty 'role' string`);
      }
    });

    this._roles = [...rolesArray];
    return this;
  }

  /**
   * Get caller role derivation rules
   * @returns {Array<{policy: Policy, role: string}>}
   */
  getRoleDerivationRules() {
    return this._roles;
  }

  /**
   * Construct a single Policy that derives caller roles based on the registered rules.
   * The resulting policy evaluates each rule's policy and returns the first matching role.
   * If no policies match, returns null (no role).
   *
   * @returns {Policy} Role derivation policy
   */
  getRoleDerivationPolicy() {
    const roleDerivationRules = this.getRoleDerivationRules();

    if (roleDerivationRules.length === 0) {
      return Policy.never;
    }

    const rolePolicies = roleDerivationRules.map((entry) => entry.policy);
    const unionPolicy = Policy.or(rolePolicies);
    return new Policy({
      name: `${this.meta.resourceType}.role_derivation`,
      resourceType: unionPolicy.resourceType,
      requires: unionPolicy.requires,
      evaluate: async (user, resource, context) => {
        // evaluate each policy and return first matching role
        // eslint-disable-next-line no-restricted-syntax
        for (const entry of roleDerivationRules) {
          // eslint-disable-next-line no-await-in-loop
          const result = await entry.policy.evaluate(user, resource, context);
          if (result) {
            return entry.role;
          }
        }
        return null; // no matching role
      },
    });
  }

  /**
   * Get attribute filtering rules for a specific action
   * Returns action-specific rules if available, otherwise falls back to '*'
   * Returns empty array if no rules are defined
   *
   * @param {string} actionName - The action name to get rules for
   * @returns {Array} Array of rule objects with {policy, attribute_filters}
   */
  getAttributeRules(actionName) {
    // Try action-specific rules first
    if (actionName in this._attributeRules) {
      return this._attributeRules[actionName];
    }

    // Fall back to wildcard rules
    if ('*' in this._attributeRules) {
      return this._attributeRules['*'];
    }

    // No rules defined
    return [];
  }

  /**
   * Get a specific action policy
   */
  getPolicy(actionName) {
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
    Object.freeze(this._attributeRules);
    Object.freeze(this._roles);
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
      attributeRules: { ...this._attributeRules },
      roles: [...this._roles],
    };
  }
}

module.exports = PolicyContainer;
