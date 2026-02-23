class HydratorRegistry {
  constructor() {
    this.hydrators = new Map();
  }

  register(type, hydrator) {
    if (!type || typeof type !== 'string') {
      throw new Error('Hydrator type must be a non-empty string');
    }
    if (!hydrator || typeof hydrator.hydrate !== 'function') {
      throw new Error('Hydrator must have a hydrate method');
    }
    if (this.hydrators.has(type)) {
      throw new Error(`Hydrator already registered for type: ${type}`);
    }

    this.hydrators.set(type, hydrator);
  }

  get(type) {
    if (!type || typeof type !== 'string') {
      throw new Error('Hydrator type must be a non-empty string');
    }
    if (!this.hydrators.has(type)) {
      throw new Error(`No hydrator registered for type: ${type}`);
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
