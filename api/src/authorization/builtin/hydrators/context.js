const { Hydrate } = require('../../core');

class ContextHydrator extends Hydrate {
  constructor({ appConfig }) {
    super();
    this.appConfig = appConfig;
  }

  // eslint-disable-next-line class-methods-use-this
  async hydrate({ attributes, cache = new Map(), preFetched = null }) {
    const cacheKey = 'context';
    if (!cache.has(cacheKey)) cache.set(cacheKey, {});
    const contextCache = cache.get(cacheKey);

    // update contextCache with preFetched values for requested attributes
    if (preFetched) {
      attributes.forEach((attr) => {
        if (attr in preFetched) {
          contextCache[attr] = preFetched[attr];
        }
      });
    }

    // Determine which attributes still need to be resolved
    const attributesToResolve = attributes.filter((attr) => !(attr in contextCache));
    if (attributesToResolve.length === 0) {
      // All attributes are already in cache, return them
      return contextCache;
    }

    // add code to resolve context attributes based on appConfig and preFetched (which can be req object)

    throw new Error(`ContextHydrator cannot resolve attributes: ${attributesToResolve.join(', ')}.`);
  }
}

const contextHydrator = new ContextHydrator({ appConfig: null });

module.exports = { ContextHydrator, contextHydrator };
