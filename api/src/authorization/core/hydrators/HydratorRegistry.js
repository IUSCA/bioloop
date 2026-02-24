const { Hydrate } = require('./BaseHydrator');
const { HydrationError } = require('./errors');

class HydratorRegistry {
  constructor(createDefaultHydrator = null) {
    this.hydrators = new Map();

    // validate createDefaultHydrator if provided
    if (createDefaultHydrator !== null && typeof createDefaultHydrator !== 'function') {
      throw new Error('createDefaultHydrator must be a function that takes a type and returns a Hydrate instance');
    }

    this.createDefaultHydrator = createDefaultHydrator;
  }

  register(type, hydrator) {
    if (!type || typeof type !== 'string') {
      throw new Error('hydrator type must be a non-empty string');
    }
    if (!hydrator || !(hydrator instanceof Hydrate)) {
      throw new Error('hydrator must be an instance of Hydrate');
    }
    if (this.hydrators.has(type)) {
      throw new Error(`hydrator already registered for type: ${type}`);
    }

    this.hydrators.set(type, hydrator);
  }

  get(type) {
    if (!type || typeof type !== 'string') {
      throw new HydrationError('hydrator type must be a non-empty string');
    }
    if (!this.hydrators.has(type)) {
      if (this.createDefaultHydrator) {
        const defaultHydrator = this.createDefaultHydrator(type);
        if (defaultHydrator instanceof Hydrate) {
          this.hydrators.set(type, defaultHydrator);
          return defaultHydrator;
        }
      }

      throw new HydrationError(`No hydrator registered for type: ${type}`);
    }
    return this.hydrators.get(type);
  }

  has(type) {
    return this.hydrators.has(type);
  }

  listTypes() {
    return Array.from(this.hydrators.keys());
  }
}

module.exports = { HydratorRegistry };
