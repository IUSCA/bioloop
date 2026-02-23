// hydrator/PrismaHydrator.js
const { Hydrate } = require('./baseHydrator');
const { modelFieldMap } = require('./schemaMap');
const { HydrationError } = require('./errors');

class PrismaHydrate extends Hydrate {
  /* options:
    - prismaClient: instance of PrismaClient to use for fetching records
    - modelName: name of the Prisma model this hydrator is for
    - idAttribute: name of the ID attribute for the model (default 'id')
  */
  constructor({ prismaClient, modelName, idAttribute = 'id' } = {}) {
    super();
    this.prisma = prismaClient;
    this.model = modelName;
    this.idAttribute = idAttribute;
    this.schemaMap = modelFieldMap.get(modelName);
    if (!this.schemaMap) throw new HydrationError(`Model ${modelName} not found in Prisma schema`);
    this.virtualLoaders = new Map();
  }

  /* Registers a virtual attribute loader function for an attribute that is not a column or relation in the Prisma model.
    - attrName: name of the virtual attribute
  * - loaderFn: async function that takes an object with shape { id, recordCache,
  * hydrator } and returns the value for the virtual attribute
  *
  * virtual loaders are independent of each other. If multiple virtual attributes are requested,
  * their loaders will be executed in parallel.
  */
  registerVirtualAttribute(attrName, loaderFn) {
    if (!attrName || typeof attrName !== 'string') {
      throw new HydrationError('Virtual attribute name must be a non-empty string');
    }
    if (typeof loaderFn !== 'function') {
      throw new HydrationError('Virtual attribute loader must be a function');
    }
    if (this.virtualLoaders.has(attrName)) {
      throw new HydrationError(`Virtual attribute loader already registered: ${attrName}`);
    }
    this.virtualLoaders.set(attrName, loaderFn);
  }

  // given a model name and an array of attribute names, returns an object classifying the attributes into columns,
  // relations or unknown (not a column or relation on the model)
  classifyAttributes(attributes) {
    if (!Array.isArray(attributes)) {
      throw new HydrationError('Attributes must be an array');
    }

    const result = {
      columns: [],
      relations: [],
      virtual: [],
      unknown: [],
    };

    attributes.forEach((attr) => {
      if (typeof attr !== 'string') {
        throw new HydrationError(`Attribute name must be a string, got ${typeof attr}`);
      }
      if (this.virtualLoaders.has(attr)) {
        result.virtual.push(attr);
      } else if (!this.schemaMap.has(attr)) {
        result.unknown.push(attr);
      } else if (this.schemaMap.get(attr)) {
        result.relations.push(attr);
      } else {
        result.columns.push(attr);
      }
    });

    return result;
  }

  preparePrismaQueryPayload(id, columns = [], relations = []) {
    if (id === null || id === undefined) {
      throw new HydrationError('Record ID cannot be null or undefined');
    }

    const payload = { where: { [this.idAttribute]: id } };
    // always include the ID attribute in the select clause if columns are specified,
    // to ensure we have it for caching and virtual loaders
    const selectColumns = columns.length > 0 && !columns.includes(this.idAttribute)
      ? [...columns, this.idAttribute]
      : columns;

    // only set select if there is something to select; an empty select:{} would return an empty object
    if (selectColumns.length > 0 || relations.length > 0) {
      payload.select = {
        ...selectColumns.reduce((acc, col) => ({ ...acc, [col]: true }), {}),
        ...relations.reduce((acc, rel) => ({ ...acc, [rel]: true }), {}),
      };
    }

    return payload;
  }

  // separating the Prisma query into its own method allows for easier testing and overrides in subclasses if needed
  async fetchPrismaRecord(payload) {
    return this.prisma[this.model].findUniqueOrThrow(payload);
  }

  async hydrate({
    id, attributes, cache = new Map(), preFetched = {},
  }) {
    if (id === null || id === undefined) {
      throw new HydrationError('Cannot hydrate: id is required');
    }
    if (!Array.isArray(attributes)) {
      throw new HydrationError('Cannot hydrate: attributes must be an array');
    }
    if (!(cache instanceof Map)) {
      throw new HydrationError('Cannot hydrate: cache must be a Map instance');
    }
    if (preFetched && typeof preFetched !== 'object') {
      throw new HydrationError('Cannot hydrate: preFetched must be an object');
    }

    const cacheKey = `${id}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, {});
    const recordCache = cache.get(cacheKey);

    // merge pre-fetched attributes, but do not overwrite keys already present in the cache
    // Use structuredClone for deep cloning
    const preFetchedClone = preFetched ? structuredClone(preFetched) : {};
    Object.keys(preFetchedClone).forEach((key) => {
      if (!(key in recordCache)) recordCache[key] = preFetchedClone[key];
    });

    // determine which attributes still need to be fetched (not in preFetched or cache)
    const attributesToFetch = attributes.filter((attr) => !(attr in recordCache));

    // classify attributes to fetch
    const classification = this.classifyAttributes(attributesToFetch);

    if (classification.unknown.length) {
      throw new HydrationError(`Unknown attributes for ${this.model}: ${classification.unknown.join(', ')}. `
    + 'Consider registering virtual loaders for these attributes');
    }

    // fetch DB attributes only if needed
    if (classification.columns.length || classification.relations.length) {
      const payload = this.preparePrismaQueryPayload(id, classification.columns, classification.relations);
      const dbRecord = await this.fetchPrismaRecord(payload);
      Object.assign(recordCache, structuredClone(dbRecord));
    }

    const virtualAttributesToResolve = classification.virtual.filter((v) => !(v in recordCache));
    await Promise.all(virtualAttributesToResolve.map(async (v) => {
      recordCache[v] = await this.virtualLoaders.get(v)({ id, recordCache, hydrator: this });
    }));

    cache.set(cacheKey, recordCache);
    return recordCache;
  }
}

module.exports = { PrismaHydrate };
