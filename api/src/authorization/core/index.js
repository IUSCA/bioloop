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

// Hydrator framework
const { Hydrate } = require('./hydrators/BaseHydrator');
const { PrismaHydrate } = require('./hydrators/PrismaHydrator');
const { HydratorRegistry } = require('./hydrators/HydratorRegistry');
const { HydrationError } = require('./hydrators/errors');
const { modelFieldMap } = require('./hydrators/schemaMap');

// Authorization engine
const { authorize, authorizeWithFilters } = require('./authorize');
const { evaluateAttributeFilters, createFilterFunction } = require('./attributeFilters');

// Middleware
const { initializePolicyContext } = require('./middlewares');

module.exports = {
  // Policy classes
  Policy,
  PolicyContainer,

  // Hydrator classes
  Hydrate,
  PrismaHydrate,
  HydratorRegistry,
  HydrationError,
  modelFieldMap,

  // Authorization functions
  authorize,
  authorizeWithFilters,
  evaluateAttributeFilters,
  createFilterFunction,

  // Middleware
  initializePolicyContext,
};
