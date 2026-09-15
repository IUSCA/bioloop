// hydrator/PrismaHydrator.js
const { Hydrator } = require('./BaseHydrator');
const { modelFieldMap } = require('./schemaMap');
const { HydrationError } = require('./errors');

class PrismaHydrator extends Hydrator {
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
    if (!this.schemaMap) throw new Error(`Model ${modelName} not found in Prisma schema`);
    this.virtualLoaders = new Map();
  }

  /**
   * The key a record is cached under. Keyed by model as well as id, because the resource cache
   * is one Map shared by every resource type in a request, and two types authorized under the
   * same id would otherwise share a record. Code that seeds a cache uses this rather than
   * building the key itself.
   * @param {string} modelName
   * @param {string|number|null} id
   * @returns {string}
   */
  static cacheKey(modelName, id) {
    return id != null ? `${modelName}:${id}` : `${modelName}:global`;
  }

  /* Registers a virtual attribute loader function for an attribute that is not a column or relation in the Prisma model.
    - attrName: name of the virtual attribute
  * - loaderFn: async function that takes an object with shape { id,
  * hydrator } and returns the value for the virtual attribute
  *
  * virtual loaders are independent of each other. If multiple virtual attributes are requested,
  * their loaders will be executed in parallel.
  */
  registerVirtualAttribute(attrName, loaderFn) {
    if (!attrName || typeof attrName !== 'string') {
      throw new Error('Virtual attribute name must be a non-empty string');
    }
    if (typeof loaderFn !== 'function') {
      throw new Error('Virtual attribute loader must be a function');
    }
    if (this.virtualLoaders.has(attrName)) {
      throw new Error(`Virtual attribute loader already registered: ${attrName}`);
    }

    // check that attrName is not already a column or relation in the Prisma model, to avoid confusion and conflicts
    if (this.schemaMap.has(attrName)) {
      throw new Error(
        `Cannot register virtual attribute loader: ${attrName} is a column or relation in the Prisma model. `
      + 'Virtual attributes must have unique names that do not conflict with actual model fields. '
      + 'Consider choosing a different name for the virtual attribute or not registering it as a virtual attribute.',
      );
    }

    this.virtualLoaders.set(attrName, loaderFn);
  }

  /**
   * Whether this hydrator can supply an attribute: a column, a relation, or a registered
   * virtual attribute. The boot check reads it so an unhydratable requirement fails at
   * startup rather than as a 500 on the first request that needs it.
   * @param {string} attr
   * @returns {boolean}
   */
  canHydrate(attr) {
    return this.schemaMap.has(attr) || this.virtualLoaders.has(attr);
  }

  // given a model name and an array of attribute names, returns an object classifying the attributes into columns,
  // relations or unknown (not a column or relation on the model)
  _classifyAttributes(attributes) {
    const result = {
      columns: [],
      relations: [],
      virtual: [],
      unknown: [],
    };

    attributes.forEach((attr) => {
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

  _preparePrismaQueryPayload(id, columns = [], relations = []) {
    const payload = { where: { [this.idAttribute]: id } };

    // only set select if there is something to select; an empty select:{} would return an empty object
    if (columns.length > 0 || relations.length > 0) {
      payload.select = {
        ...columns.reduce((acc, col) => ({ ...acc, [col]: true }), {}),
        ...relations.reduce((acc, rel) => ({ ...acc, [rel]: true }), {}),
      };
    }

    // always include the ID attribute in the select clause to ensure we have it for caching and virtual loaders
    const select = payload.select || {};
    select[this.idAttribute] = true;
    payload.select = select;

    return payload;
  }

  // separating the Prisma query into its own method allows for easier testing and overrides in subclasses if needed
  async _fetchPrismaRecord(payload) {
    // eslint-disable-next-line no-console
    console.debug(`prisma [${this.model}] :`, JSON.stringify(payload, null, 2));
    return this.prisma[this.model].findUniqueOrThrow(payload);
  }

  async hydrate({
    id, attributes, cache = new Map(), preFetched = {},
  }) {
    // console.debug(`Hydrating [${this.model}] with id [${id}] for attributes [${attributes.join(', ')}]`);
    if (!Array.isArray(attributes)) {
      throw new HydrationError(`[${this.model}] Cannot hydrate: attributes must be an array`);
    }
    // each attribute must be a string
    attributes.forEach((attr) => {
      if (typeof attr !== 'string') {
        throw new HydrationError(`[${this.model}] Cannot hydrate: attribute names must be strings, got ${typeof attr}`);
      }
    });
    if (!(cache instanceof Map)) {
      throw new HydrationError(`[${this.model}] Cannot hydrate: cache must be a Map instance`);
    }
    if (preFetched && typeof preFetched !== 'object') {
      throw new HydrationError(`[${this.model}] Cannot hydrate: preFetched must be an object`);
    }

    // A record with no id, such as the resource of a create, has nothing to key a cache entry
    // on. Two creates in one request name different owning groups, and a shared entry would
    // answer the second with the first one's attributes, so such a record lives for this call.
    const cacheKey = PrismaHydrator.cacheKey(this.model, id);
    if (id != null && !cache.has(cacheKey)) cache.set(cacheKey, {});
    const recordCache = id != null ? cache.get(cacheKey) : {};

    // merge pre-fetched attributes, but do not overwrite keys already present in the cache
    // Use structuredClone for deep cloning
    const preFetchedClone = preFetched ? structuredClone(preFetched) : {};
    Object.keys(preFetchedClone).forEach((key) => {
      if (!(key in recordCache)) recordCache[key] = preFetchedClone[key];
    });

    // determine which attributes still need to be fetched (not in preFetched or cache)
    const attributesToFetch = attributes.filter((attr) => !(attr in recordCache));

    // classify attributes to fetch
    const classification = this._classifyAttributes(attributesToFetch);

    if (classification.unknown.length) {
      throw new HydrationError(`[${this.model}] Unknown attributes: ${classification.unknown.join(', ')}. `
    + 'Consider registering virtual loaders for these attributes');
    }

    if (classification.columns.length > 0 || classification.relations.length > 0) {
      if (id == null) {
        throw new HydrationError(
          `[${this.model}] Cannot hydrate: id is required to fetch attributes `
          + `[${[...classification.columns, ...classification.relations].join(', ')}] from the database`,
        );
      }
      const payload = this._preparePrismaQueryPayload(id, classification.columns, classification.relations);
      const dbRecord = await this._fetchPrismaRecord(payload);
      Object.assign(recordCache, structuredClone(dbRecord));
    } else if (id != null) {
      // if there are no columns or relations to fetch, we still want to set the ID in the cache for virtual loaders
      // that may depend on it
      recordCache[this.idAttribute] = id;
    }

    const virtualAttributesToResolve = classification.virtual.filter((v) => !(v in recordCache));
    if (virtualAttributesToResolve.length > 0) {
      await Promise.all(virtualAttributesToResolve.map(async (v) => {
        // eslint-disable-next-line no-console
        console.debug(`Resolving virtual attribute [${v}] for model [${this.model}] with id [${id}]`);
        recordCache[v] = await this.virtualLoaders.get(v)({ id, recordCache, hydrator: this });
      }));
    }

    if (id != null) cache.set(cacheKey, recordCache);
    return recordCache;
  }
}

module.exports = { PrismaHydrator };
