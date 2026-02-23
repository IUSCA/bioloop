const prisma = require('@/db');

const { HydratorRegistry } = require('./base/hydratorRegistry');
const { Hydrate } = require('./base/baseHydrator');
const { PrismaHydrate } = require('./base/prismaHydrator');
const { HydrationError } = require('./base/errors');

function createDefaultHydrator(type) {
  // This default factory will create a PrismaHydrate for any type that doesn't have a registered hydrator.
  // It assumes that the type corresponds to a Prisma model with the same name, and that the ID attribute is 'id'.
  // You can customize this logic as needed, for example by mapping certain types to specific hydrator configurations.
  return new PrismaHydrate({ prismaClient: prisma, modelName: type });
}

const hydratorRegistry = new HydratorRegistry(createDefaultHydrator);

// Register default hydrators
hydratorRegistry.register('user', require('./user'));

module.exports = {
  hydratorRegistry,
  Hydrate,
  PrismaHydrate,
  HydrationError,
  HydratorRegistry,
};
