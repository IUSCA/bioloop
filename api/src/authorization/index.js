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

  // Hydrator framework
  Hydrate,
  PrismaHydrate,
  HydratorRegistry,
  HydrationError,

  // Authorization engine
  authorize,
  authorizeWithFilters,

  // Middleware
  initializePolicyContext,
} = require('./core');

// ============================================================================
// SECTION 2: IMPORT BUILTIN POLICIES & HYDRATORS (base app code)
// Merge conflicts here are typically simple - accept upstream changes
// ============================================================================

// Builtin policies
const groupPolicies = require('./builtin/policies/group');
const collectionPolicies = require('./builtin/policies/collection');

// Builtin hydrators
const userHydrator = require('./builtin/hydrators/user');
const contextHydrator = require('./builtin/hydrators/context');

// Builtin utilities
const { AUTH_EVENT_TYPE } = require('./builtin/audit/events');

// ============================================================================
// SECTION 3: IMPORT CUSTOM POLICIES & HYDRATORS (derived app code)
// Add your custom policy and hydrator imports here
// Example:
// const projectPolicies = require('./custom/policies/project');
// const projectHydrator = require('./custom/hydrators/project');
// ============================================================================

// (No custom policies in base repo - this section only used in derived apps)

// ============================================================================
// SECTION 4: BUILD POLICY REGISTRY
// Register all policies (builtin + custom) here
// In derived apps: add your custom policies to this registry
// ============================================================================

/**
 * Registry mapping resource types to their policy containers
 * @type {Object.<string, PolicyContainer>}
 */
const POLICY_REGISTRY = {
  // Builtin policies (shipped with base repo)
  group: groupPolicies,
  collection: collectionPolicies,

  // Custom policies (add yours here in derived apps)
  // Example:
  // project: projectPolicies,
};

// ============================================================================
// SECTION 5: INITIALIZE HYDRATOR REGISTRY
// Register all hydrators (builtin + custom) here
// ============================================================================

// Create default factory for auto-hydrator generation
function createDefaultHydrator(type) {
  return new PrismaHydrate({ prismaClient: prisma, modelName: type });
}

const hydratorRegistry = new HydratorRegistry(createDefaultHydrator);

// Register builtin hydrators
hydratorRegistry.register('user', userHydrator);
hydratorRegistry.register('context', contextHydrator);

// Register custom hydrators (add yours here in derived apps)
// Example:
// hydratorRegistry.register('project', projectHydrator);

// ============================================================================
// SECTION 6: EXPORTS
// Single export point for all authorization functionality
// ============================================================================

module.exports = {
  // Core authorization functions
  authorize,
  authorizeWithFilters,

  // Middleware
  initializePolicyContext,

  // Policy framework
  Policy,
  PolicyContainer,
  POLICY_REGISTRY,

  // Hydrator framework
  Hydrate,
  PrismaHydrate,
  HydratorRegistry,
  hydratorRegistry,
  HydrationError,

  // Events
  AUTH_EVENT_TYPE,
};
