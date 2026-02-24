const { Hydrate } = require('../../core/hydrators/BaseHydrator');

/**
 * Context hydrator for request-level context attributes.
 * This hydrator provides access to request-specific data that doesn't
 * come from the database but from the request itself.
 */
class ContextHydrator extends Hydrate {
  // eslint-disable-next-line class-methods-use-this
  async hydrate({ id, attributes, cache = new Map() }) {
    const cacheKey = `${id}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, {});
    const recordCache = cache.get(cacheKey);

    // Context attributes are typically set by middleware or passed in
    // For now, return empty object or cached values
    attributes.forEach((attr) => {
      if (!(attr in recordCache)) {
        recordCache[attr] = undefined;
      }
    });

    return recordCache;
  }
}

const contextHydrator = new ContextHydrator();

module.exports = contextHydrator;
