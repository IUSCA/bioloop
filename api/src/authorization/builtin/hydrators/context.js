const { Hydrator, HydrationError } = require('../../core');
const { loadAccessPaths } = require('../accessPaths');

class ContextHydrator extends Hydrator {
  constructor({ appConfig }) {
    super();
    this.appConfig = appConfig;
    this.virtualLoaders = new Map();
  }

  /**
   * Register a virtual context attribute loader.
   * The loader receives `{ id }` where `id` is the identifiers object
   * `{ user, resource, resourceType }` threaded from the authorize call.
   *
   * @param {string}   attrName  - Attribute name policies declare in `requires.context`
   * @param {Function} loaderFn  - async ({ id }) => value
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
    this.virtualLoaders.set(attrName, loaderFn);
  }

  /** Whether a virtual loader is registered for the attribute. @see PrismaHydrator#canHydrate */
  canHydrate(attr) {
    return this.virtualLoaders.has(attr);
  }

  /**
   * @param {Object}           options
   * @param {Object|null}      options.id          - Identifiers object `{ user, resource, resourceType }`
   *                                                 threaded from authorize().  Used as the cache key and
   *                                                 passed to virtual loaders so they can make targeted
   *                                                 queries (e.g. grant lookups for a specific resource).
   * @param {string[]}         options.attributes  - Attribute names to resolve.
   * @param {Map}              [options.cache]     - Shared per-request cache (req.policyContext.cache.context).
   * @param {Object|null}      [options.preFetched]- Caller-supplied values that seed the cache before
   *                                                 virtual loaders run (still supported; takes lower
   *                                                 priority than already-cached values).
   */
  async hydrate({
    id, attributes, cache = new Map(), preFetched = null,
  }) {
    // Cache key is scoped to the specific user+resource combination so that
    // grant-based context (e.g. active_grant_access_types) is correctly
    // isolated per resource within a single request.
    // A create has no resource id, so the resource it would create keys the entry instead. The
    // batch create route checks several owning groups in one request.
    const resourceKey = id?.resource ?? (id?.prospective ? `new:${JSON.stringify(id.prospective)}` : 'null');
    const cacheKey = id
      ? `${id.user ?? 'null'}:${id.resourceType ?? 'null'}:${resourceKey}`
      : 'global';

    if (!cache.has(cacheKey)) cache.set(cacheKey, {});
    const contextCache = cache.get(cacheKey);

    // Seed cache from preFetched — does NOT overwrite existing cache entries
    if (preFetched) {
      attributes.forEach((attr) => {
        if (attr in preFetched && !(attr in contextCache)) {
          contextCache[attr] = preFetched[attr];
        }
      });
    }

    // Resolve what's still missing
    const attributesToResolve = attributes.filter((attr) => !(attr in contextCache));
    if (attributesToResolve.length === 0) return contextCache;

    // find unknown attributes before executing any loaders,
    // to fail fast if the policy requires an attribute that doesn't exist and avoid unnecessary DB calls from loaders
    const unknownAttrs = attributesToResolve.filter((attr) => !this.virtualLoaders.has(attr));
    if (unknownAttrs.length > 0) {
      throw new HydrationError(`[ContextHydrator] Unknown attributes: ${unknownAttrs.join(', ')}. `
    + 'Consider registering virtual loaders for these attributes');
    }

    await Promise.all(
      attributesToResolve.map(async (attr) => {
        // eslint-disable-next-line no-console
        console.debug(`Hydrating context attribute [${attr}] for cache key [${cacheKey}]`);
        const loaderFn = this.virtualLoaders.get(attr);
        contextCache[attr] = await loaderFn({ id, recordCache: contextCache, hydrator: this });
      }),
    );

    return contextCache;
  }
}

const contextHydrator = new ContextHydrator({ appConfig: null });

// ============================================================================
// Built-in virtual context attributes
// ============================================================================

/**
 * access_paths
 *
 * Every path by which the caller reaches the resource, from `accessPathsQuery`: the rows, their
 * kinds, and the widened access types the grant rows carry. The builtin dataset, collection,
 * and group terms decide from it, so a check reads the same statement a list does.
 *
 * Cached under the `user:resourceType:resource` key, so one query serves every action of a
 * capability set and the attribute rules after it.
 * @see docs/design/groups/access-model-verification-plan.md — The rule is a query
 */
contextHydrator.registerVirtualAttribute('access_paths', async ({ id }) => loadAccessPaths(id));

module.exports = { ContextHydrator, contextHydrator };
