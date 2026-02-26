/**
 * Authorization System - Main Entry Point
 *
 * This file integrates the three-layer architecture:
 * - CORE: Framework code (never edit in derived apps)
 * - BUILTIN: Base application policies/hydrators (shipped with base repo)
 * - CUSTOM: Derived application extensions (only exists in derived apps)
 *
 * When creating a derived app, add your custom imports to SECTION 3 and
 * register them in SECTION 4 (POLICY_REGISTRY) and SECTION 5 (hydratorRegistry).
 */

const prisma = require('@/db');

// ============================================================================
// SECTION 1: IMPORT CORE FRAMEWORK (never edit this section)
// ============================================================================
const {
  // Policy framework
  Policy,
  PolicyContainer,
  PolicyRegistry,

  // Hydrator framework
  Hydrate,
  PrismaHydrate,
  HydratorRegistry,
  HydrationError,

  // Authorization engine
  authorize: coreAuthorize,
  authorizeWithFilters: coreAuthorizeWithFilters,

  // Middleware
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
} = require('./core');

// ============================================================================
// SECTION 2: IMPORT BUILTIN POLICIES & HYDRATORS (base app code)
// ============================================================================

// Builtin policies
const { groupPolicies } = require('./builtin/policies/group');
const { collectionPolicies } = require('./builtin/policies/collection');
const { datasetPolicies } = require('./builtin/policies/dataset');

// Builtin hydrators
const { userHydrator } = require('./builtin/hydrators/user');
const { contextHydrator } = require('./builtin/hydrators/context');

// Builtin events
const { AUTH_EVENT_TYPE } = require('./builtin/audit/events');

// ============================================================================
// SECTION 3: IMPORT CUSTOM POLICIES & HYDRATORS (derived app code)
// Add your custom policy and hydrator imports here
// ============================================================================

// ============================================================================
// SECTION 4: BUILD REGISTRIES
// Register all policies and hydrators (builtin + custom) here
// ============================================================================

const policyRegistry = new PolicyRegistry();
// Register builtin policy containers
policyRegistry.register(groupPolicies);
policyRegistry.register(collectionPolicies);
policyRegistry.register(datasetPolicies);

// Register derived app policy containers here

// Create default factory for auto-hydrator generation
function createDefaultHydrator(type) {
  return new PrismaHydrate({ prismaClient: prisma, modelName: type });
}

const hydratorRegistry = new HydratorRegistry(createDefaultHydrator);

// Register builtin hydrators
hydratorRegistry.register('user', userHydrator);
hydratorRegistry.register('context', contextHydrator);

// Register custom hydrators (add yours here in derived apps)

// create middleware function factory with the policy and hydrator registries
const createAuthorizationMiddleware = createAuthorizationMiddlewareFunction(policyRegistry, hydratorRegistry);

// inject hydrate registry into core authorize function
async function authorize({
  policy, identifiers, policyExecutionContext, preFetched,
}) {
  return coreAuthorize({
    policy,
    identifiers,
    registry: hydratorRegistry,
    policyExecutionContext,
    preFetched,
  });
}

// inject hydrate registry into core authorizeWithFilters function
async function authorizeWithFilters({
  policy, attributeRules, identifiers, policyExecutionContext, preFetched,
}) {
  return coreAuthorizeWithFilters({
    policy,
    attributeRules,
    identifiers,
    registry: hydratorRegistry,
    policyExecutionContext,
    preFetched,
  });
}

// helper function to resolve policy and attribute rules for a given resourceType and action,
// then call authorizeWithFilters
async function authorizeAction({
  resourceType, action, identifiers, policyExecutionContext, preFetched,
}) {
  // get the policy
  // fail fast if policy container or policy is not found to avoid returning a middleware that always fails at runtime
  const policyContainer = policyRegistry.get(resourceType);
  const policy = policyContainer.getPolicy(action);
  const attributeRules = policyContainer.getAttributeRules(action);

  return authorizeWithFilters({
    policy,
    attributeRules,
    identifiers,
    registry: hydratorRegistry,
    policyExecutionContext,
    preFetched,
  });
}

// ============================================================================
// SECTION 5: EXPORTS
// Single export point for all authorization functionality
// ============================================================================

module.exports = {
  // Core authorization functions
  authorize,
  authorizeWithFilters,
  authorizeAction,

  // Middleware
  initializePolicyContext,
  createAuthorizationMiddleware,
  // Policy framework
  Policy,
  PolicyContainer,
  PolicyRegistry,
  policyRegistry,

  // Hydrator framework
  Hydrate,
  PrismaHydrate,
  HydratorRegistry,
  hydratorRegistry,
  HydrationError,

  // Events
  AUTH_EVENT_TYPE,
};
