const { Hydrator } = require('./BaseHydrator');
const { HydrationError } = require('./errors');

class HydratorRegistry {
  constructor(createDefaultHydrator = null) {
    this.hydrators = new Map();

    // validate createDefaultHydrator if provided
    if (createDefaultHydrator !== null && typeof createDefaultHydrator !== 'function') {
      throw new Error('createDefaultHydrator must be a function that takes a type and returns a Hydrator instance');
    }

    this.createDefaultHydrator = createDefaultHydrator;
  }

  register(type, hydrator) {
    if (!type || typeof type !== 'string') {
      throw new Error('hydrator type must be a non-empty string');
    }
    if (!hydrator || !(hydrator instanceof Hydrator)) {
      throw new Error('hydrator must be an instance of Hydrator');
    }
    if (this.hydrators.has(type)) {
      throw new Error(`hydrator already registered for type: ${type}`);
    }

    this.hydrators.set(type, hydrator);
  }

  /**
   * Retrieves the hydrator for the given type. If no hydrator is registered for the type and a createDefaultHydrator
   * function is provided, it will attempt to create a default hydrator using that function. If a hydrator is found or
   * created, it is returned. Otherwise, an error is thrown.
   *
   * @param {string} type - The type of hydrator to retrieve
   * @returns {Hydrator} The hydrator instance for the given type
   * @throws {HydrationError} If no hydrator is registered for the type and no default hydrator can be created
   */
  get(type) {
    if (!type || typeof type !== 'string') {
      throw new HydrationError('hydrator type must be a non-empty string');
    }
    if (!this.hydrators.has(type)) {
      if (this.createDefaultHydrator) {
        const defaultHydrator = this.createDefaultHydrator(type);
        if (defaultHydrator instanceof Hydrator) {
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
