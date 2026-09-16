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
const { projectObject } = require('@/utils/expression');

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
  createDecisionPipeline,
  refusalMessage,

  // capabilities
  evaluateCapabilitySet,
  CapabilityEvaluationError,
  deriveStanding,
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
const { findUnhydratableRequirements, findAsyncTerms } = require('./core/requiresCheck');

const PLATFORM_ADMIN = { policy: isPlatformAdmin };
const { expandPath } = require('./builtin/standing');
const { accessPathsByResource, RESOURCE_TYPES } = require('./builtin/accessPaths');
const { filterRestrictedCapabilities } = require('./core/pipeline');

// Builtin hydrators
const { userHydrator } = require('./builtin/hydrators/user');
const { contextHydrator } = require('./builtin/hydrators/context');
const { accessRequestHydrator } = require('./builtin/hydrators/access_request');
const { datasetHydrator } = require('./builtin/hydrators/dataset');
const { grantHydrator } = require('./builtin/hydrators/grant');
const { collectionHydrator } = require('./builtin/hydrators/collection');

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
hydratorRegistry.register('collection', collectionHydrator);

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
  expandPath,
  // A caller with no standing on a dataset, collection, or group is answered as if it did not exist.
  // @see docs/design/groups/access-model.md — Refusal shapes
  { concealRefusalsWithoutStanding: RESOURCE_TYPES },
);

// The same pipeline the middleware runs, for routes that decide in the handler.
const decide = createDecisionPipeline({
  policyRegistry,
  hydratorRegistry,
  restrictionChecker: restrictions.checkRestriction,
  platformAdmin: PLATFORM_ADMIN,
  expandPath,
  concealRefusalsWithoutStanding: RESOURCE_TYPES,
});

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

/**
 * Decide one action in a route handler, through the pipeline the middleware runs.
 *
 * Returns the permission: `granted`, `filter`, and, when asked, `capabilities` and `standing`.
 * A refusal carries `status`, 404 or 403, and `blockedBy` when a restriction refused it.
 *
 * @param {string} resourceType
 * @param {string} action
 * @param {Object} options - `identifiers`, `policyExecutionContext`, `preFetched`,
 *   `shouldDeriveCapabilities`, and `shouldDeriveStanding`
 * @see docs/design/groups/implementation/access-model-verification-plan.md — One pipeline
 */
async function authorizeAction(resourceType, action, options) {
  return decide(resourceType, action, options);
}

/**
 * `decideRows`, keeping each row's decision so a caller can project the row by it.
 * @returns {Promise<Array<{decision: Object, meta: {capabilities: string[], standing: Object[]}}>>}
 */
async function decideEachRow(resourceType, rows, { req, idOf, action = 'view_metadata' }) {
  if (!rows.length) return [];
  const user = req.user?.subject_id;
  const ids = rows.map(idOf);
  const batched = RESOURCE_TYPES.includes(resourceType);
  const pathsById = batched && user && !req.user.is_anonymous
    ? await accessPathsByResource({ userId: user, resourceType, resourceIds: ids })
    : null;

  const metas = [];
  // One row at a time, so the first check fills the shared policy context for the rest.
  for (const [index, row] of rows.entries()) {
    const id = ids[index];
    // eslint-disable-next-line no-await-in-loop
    const decision = await authorizeAction(resourceType, action, {
      identifiers: { user, resource: id },
      policyExecutionContext: req.policyContext,
      preFetched: {
        user: req.user,
        resource: row,
        context: pathsById ? { access_paths: pathsById.get(id) } : undefined,
      },
      shouldDeriveCapabilities: true,
      shouldDeriveStanding: true,
    });
    // eslint-disable-next-line no-await-in-loop
    const capabilities = await filterRestrictedCapabilities({
      capabilities: decision.capabilities ?? {},
      resourceType,
      resourceId: id,
      preFetchedResource: row,
      restrictionChecker: restrictions.checkRestriction,
    });
    metas.push({
      decision,
      meta: { capabilities: toCapabilitiesArray(capabilities), standing: decision.standing ?? [] },
    });
  }
  return metas;
}

/**
 * Each list row's `_meta`: the capabilities and standing the detail route reports for it.
 *
 * Every row is decided with the detail route's composition: the detail action with
 * capabilities and standing, less the capabilities a restriction in force blocks. A row the
 * caller cannot open lacks the detail action, which is how a collection's datasets tab tells
 * the two apart. For a dataset, a collection, or a group, the page's paths are read once and
 * seed every row.
 *
 * What each row's state admits is the other answer, and a list route adds it as
 * `available_actions` from the fields its own query fetched.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * @param {string} resourceType
 * @param {Object[]} rows - the list's rows, unprojected, used to seed each check
 * @param {Object} options
 * @param {import('express').Request} options.req
 * @param {(row: Object) => string} options.idOf - the id a check binds: `resource_id` for a dataset
 * @param {string} [options.action] - the action the detail route authorizes
 * @returns {Promise<Array<{capabilities: string[], standing: Object[]}>>} in row order
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Paths replace the first-match role
 */
async function decideRows(resourceType, rows, options) {
  return (await decideEachRow(resourceType, rows, options)).map(({ meta }) => meta);
}

/**
 * Rows of a list, each projected by its own read decision.
 *
 * A list binds to the read action it filters on, so no decision covers the whole page. A
 * lineage row or an ancestor group has its own owning group and its own paths, and a list
 * query's scope says nothing about which fields each row shows. A row the caller may read is
 * projected by that row's rules for `action`. Any other row shows `publicAttributes`. Each row
 * carries `_meta` from `decideRows`.
 *
 * @param {string} resourceType
 * @param {Object[]} rows
 * @param {Object} options
 * @param {import('express').Request} options.req
 * @param {(row: Object) => string} options.idOf
 * @param {string[]} options.publicAttributes - what a row shows a caller who cannot read it
 * @param {string[]} [options.relationAttributes] - fields that describe the row's place in the
 *   list rather than the row, such as `depth`, kept whatever the row's decision
 * @param {string} [options.action] - the read action, `view_metadata` unless named
 * @param {(row: Object) => string[]} [options.availableActionsOf] - what the row's state admits,
 *   read from the fields the list's own query fetched. Omitted when a list does not fetch them,
 *   because a state rule refuses to decide from a field the caller did not fetch.
 *   @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @returns {Promise<Object[]>}
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 16
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Projection applied to rows it was not decided for
 */
async function projectRows(resourceType, rows, {
  req, idOf, publicAttributes, relationAttributes = [], action = 'view_metadata',
  availableActionsOf = null,
}) {
  const decided = await decideEachRow(resourceType, rows, { req, idOf, action });
  return rows.map((row, index) => {
    const { decision, meta } = decided[index];
    const projected = decision.granted ? decision.filter(row) : projectObject(row, publicAttributes);
    relationAttributes.forEach((name) => { if (name in row) projected[name] = row[name]; });
    const full = availableActionsOf ? { ...meta, available_actions: availableActionsOf(row) } : meta;
    return { ...projected, _meta: full };
  });
}

// Every attribute a policy, an attribute rule, or a transition row declares must be one a
// hydrator can supply. An unmet requirement is a 500 on the first ordinary request that
// evaluates it, so it fails here, at startup, instead.
// @see docs/design/groups/implementation/access-model-verification-plan.md — The static checks that already exist
const unhydratable = findUnhydratableRequirements(policyRegistry, hydratorRegistry);
if (unhydratable.length) {
  throw new Error(`Policies declare attributes no hydrator supplies:\n  ${unhydratable.join('\n  ')}`);
}

// An async `evaluate` reads the database itself, so its `requires` understates what it reads
// and no list statement can restate it. Its read belongs in a hydrator virtual attribute.
// @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 4: the rule becomes a query
const asyncTerms = findAsyncTerms(policyRegistry);
if (asyncTerms.length) {
  throw new Error(`Policies read the database inside evaluate:\n  ${asyncTerms.join('\n  ')}`);
}

// ============================================================================
// SECTION 5: EXPORTS
// Single export point for all authorization functionality
// ============================================================================

/**
 * Whether the caller is a platform admin, read from `user_role` the way the engine reads it.
 *
 * A list handler asks this to choose between the unfiltered query and the one scoped to the
 * caller. Reading the session's roles instead kept a demoted admin's unfiltered lists until
 * the token expired. The request's policy context caches the answer.
 *
 * @param {import('express').Request} req
 * @returns {Promise<boolean>}
 * @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 14
 */
async function callerIsPlatformAdmin(req) {
  const id = req.user?.subject_id;
  if (!id || req.user.is_anonymous) return false;
  const user = await userHydrator.hydrate({
    id, attributes: ['current_roles'], cache: req.policyContext?.cache?.user ?? new Map(),
  });
  return isPlatformAdmin.evaluate(user);
}

module.exports = {
  // Core authorization functions
  authorizeWithFilters,
  authorizeAction,
  callerIsPlatformAdmin,
  decideRows,
  projectRows,

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

  // capabilities
  evaluateCapabilitySet,
  CapabilityEvaluationError,
  deriveStanding,
  toCapabilitiesArray,
};
