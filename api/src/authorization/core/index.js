/**
 * Core Authorization Framework
 *
 * This module contains all framework-level code that should never be modified
 * in derived applications. It provides the foundational classes and utilities
 * for building attribute-based access control (ABAC) systems.
 */

// Policy framework
const Policy = require('./policies/Policy');
const PolicyContainer = require('./policies/PolicyContainer');
const PolicyRegistry = require('./policies/PolicyRegistry');

// Hydrator framework
const { Hydrator } = require('./hydrators/BaseHydrator');
const { PrismaHydrator } = require('./hydrators/PrismaHydrator');
const { HydratorRegistry } = require('./hydrators/HydratorRegistry');
const { HydrationError } = require('./hydrators/errors');
const { modelFieldMap } = require('./hydrators/schemaMap');

// Authorization engine
const { authorizeWithFilters } = require('./authorize');
const { evaluateCapabilitySet, CapabilityEvaluationError } = require('./evaluateCapabilitySet');
const { evaluateAttributeFilters, createFilterFunction } = require('./attributeFilters');

// Middleware
const { initializePolicyContext, createAuthorizationMiddlewareFunction } = require('./middlewares');

module.exports = {
  // Policy classes
  Policy,
  PolicyContainer,
  PolicyRegistry,

  // Hydrator classes
  Hydrator,
  PrismaHydrator,
  HydratorRegistry,
  HydrationError,
  modelFieldMap,

  // Authorization functions
  authorizeWithFilters,
  evaluateCapabilitySet,
  CapabilityEvaluationError,
  evaluateAttributeFilters,
  createFilterFunction,

  // Middleware
  initializePolicyContext,
  createAuthorizationMiddlewareFunction,
};
