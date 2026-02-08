/**
 * @fileoverview Authorization policies module
 *
 * Manages policy resolution for authorization checks, supporting both code-defined
 * policies and configuration-based RBAC policies. Policies can be combined or
 * prioritized based on enforcement mode.
 */

const posts = require('./posts');
const RBAC_POLICIES = require('./rbac');

/**
 * Registry mapping models to their policy definitions
 * @type {Object.<string, {meta: Object, actions: Object}>}
 */
const POLICY_REGISTRY = {
  post: {
    meta: posts.meta,
    actions: posts.actions,
  },
};

/**
 * Retrieves a policy function for a given model and action
 *
 * Resolves policies from the code-based POLICY_REGISTRY and config-based RBAC_POLICIES.
 * When both exist, behavior depends on enforceBoth:
 * - true: Returns a combined function requiring both policies to pass
 * - false: Returns the code-based policy (higher priority)
 *
 * @param {string} model - The model name (e.g., 'post')
 * @param {string} action - The action name (e.g., 'create', 'read', 'update', 'delete')
 * @param {boolean} [enforceBoth=false] - Whether to enforce both code and config policies when both are present
 * @returns {Function|null} Policy function with signature (user, resource, ctx) => boolean, or null if not found
 *
 * @example
 * const policy = getPolicy('post', 'create', true);
 * if (policy && policy(user, postResource, { ip: '192.168.1.1' })) {
 *   // User is authorized to create post
 * }
 */
function getPolicy(model, action, enforceBoth = false) {
  const codePolicy = POLICY_REGISTRY[model]?.actions?.[action] || null;

  const configPolicy = RBAC_POLICIES[model]?.actions?.[action] || null;

  // if both exist, and enforceBoth is true, combine them, else return codePolicy
  if (codePolicy && configPolicy) {
    if (enforceBoth) {
      return (user, resource, ctx = {}) => {
        const configResult = configPolicy(user, resource, ctx);
        if (!configResult) return false;
        return codePolicy(user, resource, ctx);
      };
    }
    return codePolicy;
  }

  return codePolicy || configPolicy || null;
}

/**
 * Retrieves metadata for a given model
 *
 * @param {string} model - The model name (e.g., 'post')
 * @returns {Object|null} Model metadata object or null if model not found in registry
 *
 * @example
 * const meta = getPolicyMeta('post');
 * // Returns: { resourceType: 'post', description: '...' } or null
 */
function getPolicyMeta(model) {
  return POLICY_REGISTRY[model]?.meta ?? null;
}

module.exports = {
  getPolicy,
  getPolicyMeta,
};
