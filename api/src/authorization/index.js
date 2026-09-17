/**
 * Authorization System - Main Entry Point
 *
 * This file reads as configuration. It imports the three layers and registers what they declare:
 * - CORE: Framework code (never edit in derived apps)
 * - BUILTIN: Base application policies, hydrators, and paths (shipped with base repo)
 * - CUSTOM: Derived application extensions (only exists in derived apps)
 *
 * A derived app adds its imports to SECTION 3 and registers them in SECTION 4.
 * @see src/authorization/custom/README.md
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
  assertRegistriesValid,

  // Middleware
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
  createDecisionPipeline,
  refusalMessage,

  // capabilities
  evaluateCapabilitySet,
  CapabilityEvaluationError,
  deriveStanding,
  toCapabilitiesArray,
} = require('./core');

// ============================================================================
// SECTION 2: IMPORT BUILTIN POLICIES, HYDRATORS & PATHS (base app code)
// ============================================================================

// Builtin policies
const { groupPolicies } = require('./builtin/policies/group');
const { collectionPolicies } = require('./builtin/policies/collection');
const { datasetPolicies } = require('./builtin/policies/dataset');
const { accessRequestPolicies } = require('./builtin/policies/access_request');
const { grantPolicies } = require('./builtin/policies/grant');
const { userPolicies } = require('./builtin/policies/user');
const { auditPolicies } = require('./builtin/policies/audit');

// Builtin hydrators
const { userHydrator } = require('./builtin/hydrators/user');
const { contextHydrator } = require('./builtin/hydrators/context');
const { accessRequestHydrator } = require('./builtin/hydrators/access_request');
const { datasetHydrator } = require('./builtin/hydrators/dataset');
const { grantHydrator } = require('./builtin/hydrators/grant');
const { collectionHydrator } = require('./builtin/hydrators/collection');

// Builtin paths: the SQL each path-based resource type decides from
const { pathRegistry, accessPathsQuery, accessibleIdsQuery } = require('./builtin/paths');
const datasetPaths = require('./builtin/paths/dataset');
const collectionPaths = require('./builtin/paths/collection');
const groupPaths = require('./builtin/paths/group');
const { expandPath } = require('./builtin/paths/standing');

// Builtin restriction layer
const restrictions = require('./builtin/restrictions');

// The single platform-admin check. Policies do not name the role; the engine consults this
// once, before any action policy runs and after the restriction check.
// @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
const { isPlatformAdmin } = require('./builtin/policies/utils/index');

const { createListHelpers } = require('./builtin/lists');

// ============================================================================
// SECTION 3: IMPORT CUSTOM POLICIES, HYDRATORS & PATHS (derived app code)
// Add your custom imports here
// ============================================================================

// ============================================================================
// SECTION 4: BUILD REGISTRIES
// Register all policies, hydrators, and paths (builtin + custom) here
// ============================================================================

const policyRegistry = new PolicyRegistry();
policyRegistry.register(groupPolicies);
policyRegistry.register(collectionPolicies);
policyRegistry.register(datasetPolicies);
policyRegistry.register(accessRequestPolicies);
policyRegistry.register(grantPolicies);
policyRegistry.register(userPolicies);
policyRegistry.register(auditPolicies);
// Register derived app policy containers here

// A type with no registered hydrator gets a plain Prisma hydrator for its model.
const hydratorRegistry = new HydratorRegistry((type) => new PrismaHydrator({ prismaClient: prisma, modelName: type }));
hydratorRegistry.register('user', userHydrator);
hydratorRegistry.register('context', contextHydrator);
hydratorRegistry.register('access_request', accessRequestHydrator);
hydratorRegistry.register('dataset', datasetHydrator);
hydratorRegistry.register('grant', grantHydrator);
hydratorRegistry.register('collection', collectionHydrator);
// Register custom hydrators here

// Only a type whose terms read `context.access_paths` registers paths.
pathRegistry.register(datasetPaths);
pathRegistry.register(collectionPaths);
pathRegistry.register(groupPaths);
// Register custom paths here

assertRegistriesValid(policyRegistry, hydratorRegistry);

// ============================================================================
// SECTION 5: WIRING (never edit this section)
// ============================================================================

// The restriction checker, the platform-admin check, and the path expansion are injected, so
// core stays framework code. A caller with no standing on a path-based resource is answered as
// if it did not exist.
// @see docs/design/groups/decisions.md — 6. Restrictions compose by AND; grants stay additive
// @see docs/design/groups/access-model.md — Refusal shapes
const PIPELINE_OPTIONS = {
  policyRegistry,
  hydratorRegistry,
  restrictionChecker: restrictions.checkRestriction,
  platformAdmin: { policy: isPlatformAdmin },
  expandPath,
  concealRefusalsWithoutStanding: pathRegistry.listTypes(),
};

const createAuthorizationMiddleware = createAuthorizationMiddlewareFunction(
  PIPELINE_OPTIONS.policyRegistry,
  PIPELINE_OPTIONS.hydratorRegistry,
  undefined,
  PIPELINE_OPTIONS.restrictionChecker,
  PIPELINE_OPTIONS.platformAdmin,
  PIPELINE_OPTIONS.expandPath,
  { concealRefusalsWithoutStanding: PIPELINE_OPTIONS.concealRefusalsWithoutStanding },
);

/**
 * Decide one action in a route handler, through the pipeline the middleware runs.
 *
 * Returns the permission: `granted`, `filter`, and, when asked, `capabilities` and `standing`.
 * A refusal carries `status`, 404 or 403, and `blockedBy` when a restriction refused it.
 * @see docs/design/groups/implementation/access-model-verification-plan.md — One pipeline
 */
const authorizeAction = createDecisionPipeline(PIPELINE_OPTIONS);

const {
  callerIsPlatformAdmin, listFilter, decideRows, standingOfRows,
} = createListHelpers({
  decide: authorizeAction,
  restrictionChecker: restrictions.checkRestriction,
  userHydrator,
  isPlatformAdmin,
});

/** `authorizeWithFilters` from core, bound to this app's hydrator registry. */
function authorizeWithFilters(options) {
  return coreAuthorizeWithFilters({ ...options, registry: hydratorRegistry });
}

// ============================================================================
// SECTION 6: EXPORTS
// ============================================================================

module.exports = {
  // Core authorization functions
  authorizeWithFilters,
  authorizeAction,

  // List helpers
  callerIsPlatformAdmin,
  decideRows,
  listFilter,
  standingOfRows,

  // Restriction layer
  restrictions,

  // Middleware
  initializePolicyContext,
  createAuthorizationMiddleware,
  refusalMessage,

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

  // Paths. Services read them here, so the registrations above have run.
  pathRegistry,
  accessPathsQuery,
  accessibleIdsQuery,

  // capabilities
  evaluateCapabilitySet,
  CapabilityEvaluationError,
  deriveStanding,
  toCapabilitiesArray,
};
