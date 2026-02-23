const { HydratorRegistry } = require('./base/hydratorRegistry');
const { Hydrate } = require('./base/baseHydrator');
const { PrismaHydrate } = require('./base/prismaHydrator');
const { HydrationError } = require('./base/errors');

const hydratorRegistry = new HydratorRegistry();

// Register default hydrators
hydratorRegistry.register('user', require('./user'));

module.exports = {
  hydratorRegistry,
  Hydrate,
  PrismaHydrate,
  HydrationError,
  HydratorRegistry,
};
