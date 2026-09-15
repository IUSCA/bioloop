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
  Hydrator,
  PrismaHydrator,
  HydratorRegistry,
  HydrationError,

  // Authorization engine
  authorizeWithFilters: coreAuthorizeWithFilters,

  // Middleware
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,

  // capabilities
  evaluateCapabilitySet,
  CapabilityEvaluationError,
  deriveCallerRole,
  toCapabilitiesArray,
} = require('./core');

// ============================================================================
// SECTION 2: IMPORT BUILTIN POLICIES & HYDRATORS (base app code)
// ============================================================================

// Builtin policies
const { groupPolicies } = require('./builtin/policies/group');
const { collectionPolicies } = require('./builtin/policies/collection');
const { datasetPolicies } = require('./builtin/policies/dataset');
const { accessRequestPolicies } = require('./builtin/policies/access_request');
const { grantPolicies } = require('./builtin/policies/grant');
const { userPolicies } = require('./builtin/policies/user');
const { auditPolicies } = require('./builtin/policies/audit');

// Builtin restriction layer
const restrictions = require('./builtin/restrictions');

// The single platform-admin check. Policies do not name the role; the engine consults this
// once, before any action policy runs and after the restriction check.
// @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
const { isPlatformAdmin } = require('./builtin/policies/utils/index');
const { findUnhydratableRequirements } = require('./core/requiresCheck');

const PLATFORM_ADMIN = { policy: isPlatformAdmin, callerRole: 'PLATFORM_ADMIN' };

// Builtin hydrators
const { userHydrator } = require('./builtin/hydrators/user');
const { contextHydrator } = require('./builtin/hydrators/context');
const { accessRequestHydrator } = require('./builtin/hydrators/access_request');
const { datasetHydrator } = require('./builtin/hydrators/dataset');
const { grantHydrator } = require('./builtin/hydrators/grant');

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
policyRegistry.register(accessRequestPolicies);
policyRegistry.register(grantPolicies);
policyRegistry.register(userPolicies);
policyRegistry.register(auditPolicies);

// Register derived app policy containers here

// Create default factory for auto-hydrator generation
function createDefaultHydrator(type) {
  return new PrismaHydrator({ prismaClient: prisma, modelName: type });
}

const hydratorRegistry = new HydratorRegistry(createDefaultHydrator);

// Register builtin hydrators
hydratorRegistry.register('user', userHydrator);
hydratorRegistry.register('context', contextHydrator);
hydratorRegistry.register('access_request', accessRequestHydrator);
hydratorRegistry.register('dataset', datasetHydrator);
hydratorRegistry.register('grant', grantHydrator);

// Register custom hydrators (add yours here in derived apps)

// create middleware function factory with the policy and hydrator registries.
// The restriction checker is injected here rather than imported by the core engine, so
// core stays framework code and the restriction layer stays part of this application.
// @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
const createAuthorizationMiddleware = createAuthorizationMiddlewareFunction(
  policyRegistry,
  hydratorRegistry,
  undefined,
  restrictions.checkRestriction,
  PLATFORM_ADMIN,
);

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
async function authorizeAction(resourceType, action, {
  identifiers,
  policyExecutionContext,
  preFetched,
  shouldDeriveCapabilities = false, // whether to derive capabilities and include them in the policy execution context
  shouldDeriveCallerRole = false, // whether to derive caller role and include it in the policy execution context
}) {
  // get the policy
  // fail fast if policy container or policy is not found to avoid returning a middleware that always fails at runtime
  const policyContainer = policyRegistry.get(resourceType);
  const policy = policyContainer.getPolicy(action);
  const attributeRules = policyContainer.getAttributeRules(action);

  // allowed = no restriction blocks this AND some grant permits it.
  const blockedBy = await restrictions.checkRestriction({
    resourceType,
    action,
    resourceId: identifiers.resource,
    preFetchedResource: preFetched?.resource,
  });
  if (blockedBy) {
    return { granted: false, filter: null, blockedBy };
  }

  // A platform admin is allowed every action, so the action's own policy is not consulted.
  // After the restriction check, for the same reason as in the middleware.
  // @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
  const adminResult = await authorizeWithFilters({
    policy: PLATFORM_ADMIN.policy,
    // Everything, always. An empty rule set makes a filter that strips every field.
    attributeRules: [{ policy: Policy.always, attribute_filters: ['*'] }],
    identifiers,
    registry: hydratorRegistry,
    policyExecutionContext,
    preFetched,
  });
  if (adminResult.granted) {
    if (shouldDeriveCapabilities) {
      adminResult.capabilities = Object.fromEntries(
        policyContainer.getActionNames().map((name) => [name, true]),
      );
    }
    if (shouldDeriveCallerRole) {
      adminResult.callerRole = PLATFORM_ADMIN.callerRole;
    }
    return adminResult;
  }

  const permission = await authorizeWithFilters({
    policy,
    attributeRules,
    identifiers,
    registry: hydratorRegistry,
    policyExecutionContext,
    preFetched,
  });

  if (shouldDeriveCapabilities) {
    const capabilities = await evaluateCapabilitySet({
      policyContainer,
      identifiers,
      hydratorRegistry,
      policyExecutionContext,
    });
    permission.capabilities = capabilities;
  }
  if (shouldDeriveCallerRole) {
    const callerRole = await deriveCallerRole({
      policyContainer, identifiers, hydratorRegistry, policyExecutionContext,
    });
    permission.callerRole = callerRole;
  }
  return permission;
}

// Every attribute a policy, an attribute rule, or a transition row declares must be one a
// hydrator can supply. An unmet requirement is a 500 on the first ordinary request that
// evaluates it, so it fails here, at startup, instead.
// @see docs/design/groups/access-model-verification-plan.md — The static checks that already exist
const unhydratable = findUnhydratableRequirements(policyRegistry, hydratorRegistry);
if (unhydratable.length) {
  throw new Error(`Policies declare attributes no hydrator supplies:\n  ${unhydratable.join('\n  ')}`);
}

// ============================================================================
// SECTION 5: EXPORTS
// Single export point for all authorization functionality
// ============================================================================

module.exports = {
  // Core authorization functions
  authorizeWithFilters,
  authorizeAction,

  // Restriction layer
  restrictions,

  // Middleware
  initializePolicyContext,
  createAuthorizationMiddleware,
  // Policy framework
  Policy,
  PolicyContainer,
  PolicyRegistry,
  policyRegistry,

  // Hydrator framework
  Hydrator,
  PrismaHydrator,
  HydratorRegistry,
  hydratorRegistry,
  HydrationError,

  // capabilities
  evaluateCapabilitySet,
  CapabilityEvaluationError,
  deriveCallerRole,
  toCapabilitiesArray,
};
