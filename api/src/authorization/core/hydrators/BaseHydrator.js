/* eslint-disable no-unused-vars */
class Hydrate {
  constructor() {
    if (new.target === Hydrate) {
      throw new Error('Cannot instantiate abstract class Hydrate directly');
    }
  }

  /**
   * Hydrate the object of a given type.
   * @param {Object} options
   *   - id: identifier of the entity
   *   - attributes: array of attribute names to resolve
   *   - cache: Map for request-scoped caching per entity type,
   *   where keys are entity identifiers and values are objects with resolved attributes.
   *   This allows sharing resolved attributes across multiple hydrations within the same request.
   *   - preFetched: optional object that already has some attributes
   * @returns {Object} hydrated attributes
   */
  // eslint-disable-next-line class-methods-use-this
  async hydrate({
    id, attributes, cache, preFetched = {},
  }) {
    throw new Error("Abstract method 'hydrate' must be implemented in subclass");
  }
}

module.exports = { Hydrate };
