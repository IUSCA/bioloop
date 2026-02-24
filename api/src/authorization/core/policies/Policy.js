/**
 * Base policy class for authorization control.
 *
 *
 * @class Policy
 * @param {Object} config - Policy configuration object
 * @param {string} config.resourceType - The type of resource this policy applies to. This is the name used to register the Hydrator that will fetch the resource attributes required by this policy.
 * @param {Object} config.requires - Required parameters for policy evaluation
 * @param {string[]} config.requires.user - Array of required user attributes
 * @param {string[]} config.requires.resource - Array of required resource attributes
 * @param {string[]} config.requires.context - Array of required context attributes
 * @param {Function} config.evaluate - Async function that evaluates the authorization policy.
 *                                      Called with user, resource, and context parameters
 *
 * @throws {Error} If requires is not an object
 * @throws {Error} If requires.user, requires.resource, or requires.context is not an array
 * @throws {Error} If any item in requires arrays is not a string
 * @throws {Error} If evaluate is not a function
 *
 * @example
 * const policy = new Policy({
 *   name: 'isOwnerAndAdmin',
 *   resourceType: 'post',
 *   requires: {
 *     user: ['id', 'role'],
 *     resource: ['ownerId'],
 *     context: []
 *   },
 *   evaluate: async (user, resource, context) => user.id === resource.ownerId && user.role === 'admin'
 * });
 */
class Policy {
  constructor({
    name, resourceType, requires, evaluate,
  }) {
    if (!name || typeof name !== 'string') {
      throw new Error('Policy name must be a non-empty string');
    }

    // resourceType can be null for policies that are not tied to a specific resource type (e.g.
    // platform-level policies), but if provided it must be a non-empty string
    if (resourceType !== null && (typeof resourceType !== 'string' || resourceType.length === 0)) {
      throw new Error('Policy resourceType must be a non-empty string or null');
    }

    // validate requires has at least one of these keys: user, resource, context
    // and values are array of strings
    if (typeof requires !== 'object' || requires === null) {
      throw new Error('Policy requires must be an object');
    }
    const allowedKeys = ['user', 'resource', 'context'];
    Object.keys(requires).forEach((key) => {
      if (!allowedKeys.includes(key)) {
        throw new Error(`Invalid key in policy requires: ${key}`);
      }
      if (!Array.isArray(requires[key])) {
        throw new Error(`Policy requires.${key} must be an array`);
      }
      requires[key].forEach((attr) => {
        if (typeof attr !== 'string') {
          throw new Error(`Policy requires.${key} must be an array of strings`);
        }
      });
    });
    // at least one of user, resource, context must be present in requires
    if (!requires.user && !requires.resource && !requires.context) {
      throw new Error('Policy requires must have at least one of user, resource, or context');
    }

    // ensure all required keys are present in requires, even if empty
    const completeRequires = {
      user: requires.user || [],
      resource: requires.resource || [],
      context: requires.context || [],
    };

    // validate evaluate is a function
    if (typeof evaluate !== 'function') {
      throw new Error('Policy evaluate must be a function');
    }

    this.name = name;
    this.resourceType = resourceType;
    this.requires = completeRequires;
    this._evaluate = evaluate;
  }

  async evaluate(user, resource, context) {
    // Ensure we have valid objects to check attributes on
    const safeUser = user || {};
    const safeResource = resource || {};
    const safeContext = context || {};

    // check if required attributes are present on user, resource, context
    const missingUserAttrs = this.requires.user.filter((attr) => !(attr in safeUser));
    const missingResourceAttrs = this.requires.resource.filter((attr) => !(attr in safeResource));
    const missingContextAttrs = this.requires.context.filter((attr) => !(attr in safeContext));

    if (missingUserAttrs.length > 0) {
      throw new Error(
        `Policy: ${this.name} - Missing required user attributes for evaluation: ${missingUserAttrs.join(', ')}`,
      );
    }
    if (missingResourceAttrs.length > 0) {
      throw new Error(
        `Policy: ${this.name} - Missing required resource`
        + ` attributes for evaluation: ${missingResourceAttrs.join(', ')}`,
      );
    }
    if (missingContextAttrs.length > 0) {
      throw new Error(
        `Policy: ${this.name} - Missing required context attributes for evaluation: ${missingContextAttrs.join(', ')}`,
      );
    }

    const result = await this._evaluate(safeUser, safeResource, safeContext);

    // console.log(`Evaluating ${this.name} policy:`, JSON.stringify({
    //   user: safeUser, resource: safeResource, context: safeContext, result,
    // }, null, 2));

    return result;
  }

  setName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Policy name must be a non-empty string');
    }
    this.name = name;
    return this;
  }

  clone() {
    return new Policy({
      name: this.name,
      resourceType: this.resourceType,
      requires: this.requires,
      evaluate: this._evaluate,
    });
  }

  cloneWithName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Policy name must be a non-empty string');
    }
    return new Policy({
      name,
      resourceType: this.resourceType,
      requires: this.requires,
      evaluate: this._evaluate,
    });
  }
}

function merge(...arrays) {
  return [...new Set(arrays.flat())];
}

function validateMergeAndResourceType(...policies) {
  if (!policies || policies.length === 0) {
    throw new Error('or() requires at least one policy');
  }
  if (policies.some((p) => !(p instanceof Policy))) {
    throw new Error('All arguments to or() must be Policy instances');
  }

  // can only combine policies of the same resourceType
  // resourceType can be null, but if not null must be the same across all policies
  const resourceTypes = new Set(policies.map((p) => p.resourceType).filter((rt) => rt !== null));
  if (resourceTypes.size > 1) {
    throw new Error('Can only combine policies of the same resource type');
  }
  const resourceType = resourceTypes.size === 1 ? [...resourceTypes][0] : null;
  return resourceType;
}

function mergeRequires(...policies) {
  return {
    user: merge(...policies.map((p) => p.requires.user)),
    resource: merge(...policies.map((p) => p.requires.resource)),
    context: merge(...policies.map((p) => p.requires.context)),
  };
}

function or(policies, name = null) {
  const resourceType = validateMergeAndResourceType(...policies);

  return new Policy({
    name: name || `or(${policies.map((p) => p.name).join(',')})`,
    resourceType,
    requires: mergeRequires(...policies),
    evaluate: async (user, resource, ctx) => {
      // eslint-disable-next-line no-restricted-syntax
      for (const p of policies) {
        // eslint-disable-next-line no-await-in-loop
        if (await p.evaluate(user, resource, ctx)) {
          return true;
        }
      }
      return false;
    },
  });
}

function and(policies, name = null) {
  const resourceType = validateMergeAndResourceType(...policies);

  // merge requires from all policies
  return new Policy({
    name: name || `and(${policies.map((p) => p.name).join(',')})`,
    resourceType,
    requires: mergeRequires(...policies),
    evaluate: async (user, resource, ctx) => {
      // eslint-disable-next-line no-restricted-syntax
      for (const p of policies) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await p.evaluate(user, resource, ctx))) {
          return false;
        }
      }
      return true;
    },
  });
}

function not(policy, name = null) {
  if (!policy || !(policy instanceof Policy)) {
    throw new Error('not() requires a Policy instance');
  }

  return new Policy({
    name: name || `not(${policy.name})`,
    resourceType: policy.resourceType,
    requires: policy.requires,
    evaluate: async (user, resource, ctx) => !(await policy.evaluate(user, resource, ctx)),
  });
}

// static methods for combining policies
Policy.or = or;
Policy.and = and;
Policy.not = not;
Policy.always = new Policy({
  name: 'always',
  resourceType: null,
  requires: { user: [], resource: [], context: [] },
  evaluate: async () => true,
});
Policy.never = new Policy({
  name: 'never',
  resourceType: null,
  requires: { user: [], resource: [], context: [] },
  evaluate: async () => false,
});

module.exports = Policy;
