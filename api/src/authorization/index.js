const { authorize } = require('./authorize');
const { initializePolicyContext } = require('./middlewares');
const { hydratorRegistry, HydrationError } = require('./hydrators');
const { Policy } = require('./policies');
const { AUTH_EVENT_TYPE } = require('./audit/events');
const groupPolicies = require('./policies/group');

/**
 * Registry mapping models to their policy definitions
 * @type {Object.<string, PolicyContainer>}
 */
const POLICY_REGISTRY = {
  group: groupPolicies,
};

module.exports = {
  // Core authorization
  authorize,

  // Middleware
  initializePolicyContext,

  // Hydrators
  hydratorRegistry,
  HydrationError,

  // Policies
  Policy,
  POLICY_REGISTRY,

  // Events
  AUTH_EVENT_TYPE,
};
