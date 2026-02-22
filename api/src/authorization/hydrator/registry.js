class HydratorRegistry {
  constructor() {
    this.hydrators = new Map();
  }

  register(type, hydrator) {
    if (this.hydrators.has(type)) {
      throw new Error(`Hydrator already registered for type: ${type}`);
    }

    this.hydrators.set(type, hydrator);
  }

  get(type) {
    if (!this.hydrators.has(type)) {
      throw new Error(`No hydrator registered for type: ${type}`);
    }
    return this.hydrators.get(type);
  }

  listTypes() {
    return Array.from(this.hydrators.keys());
  }
}

module.exports = new HydratorRegistry();
