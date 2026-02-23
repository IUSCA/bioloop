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
 * @param {Function} config.evaluate - Function that evaluates the authorization policy.
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
 *   evaluate: (user, resource, context) => user.id === resource.ownerId && user.role === 'admin'
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

  evaluate(user, resource, context) {
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

    return this._evaluate(safeUser, safeResource, safeContext);
  }
}

function merge(...arrays) {
  return [...new Set(arrays.flat())];
}

function or(...policies) {
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

  // merge requires from all policies
  return new Policy({
    name: `or(${policies.map((p) => p.name).join(',')})`,
    resourceType: policies[0].resourceType,
    requires: {
      user: merge(...policies.map((p) => p.requires.user)),
      resource: merge(...policies.map((p) => p.requires.resource)),
      context: merge(...policies.map((p) => p.requires.context)),
    },
    evaluate: (user, resource, ctx) => policies.some((p) => p.evaluate(user, resource, ctx)),
  });
}

function and(...policies) {
  if (!policies || policies.length === 0) {
    throw new Error('and() requires at least one policy');
  }
  if (policies.some((p) => !(p instanceof Policy))) {
    throw new Error('All arguments to and() must be Policy instances');
  }

  // can only combine policies of the same resourceType
  // resourceType can be null, but if not null must be the same across all policies
  const resourceTypes = new Set(policies.map((p) => p.resourceType).filter((rt) => rt !== null));
  if (resourceTypes.size > 1) {
    throw new Error('Can only combine policies of the same resource type');
  }

  // merge requires from all policies
  return new Policy({
    name: `and(${policies.map((p) => p.name).join(',')})`,
    resourceType: policies[0].resourceType,
    requires: {
      user: merge(...policies.map((p) => p.requires.user)),
      resource: merge(...policies.map((p) => p.requires.resource)),
      context: merge(...policies.map((p) => p.requires.context)),
    },
    evaluate: (user, resource, ctx) => policies.every((p) => p.evaluate(user, resource, ctx)),
  });
}

function not(policy) {
  if (!policy || !(policy instanceof Policy)) {
    throw new Error('not() requires a Policy instance');
  }

  return new Policy({
    name: `not(${policy.name})`,
    resourceType: policy.resourceType,
    requires: policy.requires,
    evaluate: (user, resource, ctx) => !policy.evaluate(user, resource, ctx),
  });
}

// static methods for combining policies
Policy.or = or;
Policy.and = and;
Policy.not = not;

module.exports = Policy;
