const grantService = require('@/services/grants');
const { Hydrator, HydrationError } = require('../../core');

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
    const cacheKey = id
      ? `${id.user ?? 'null'}:${id.resourceType ?? 'null'}:${id.resource ?? 'null'}`
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
 * active_grant_access_types
 *
 * A Set<string> of all grant access-type names currently active for the
 * calling user on the requested resource.  Covers:
 *   - Direct USER grants on the resource
 *   - GROUP grants where the user is a transitive member of the subject group
 *   - For datasets: collection-level grants (USER or GROUP) on any collection
 *     that contains the dataset
 *
 * Policies declare `requires: { context: ['active_grant_access_types'] }` and
 * evaluate with `context.active_grant_access_types.has(access_type)` — a pure
 * in-memory Set membership test after this single DB call.
 *
 * The result is cached under the `user:resourceType:resource` cache key for
 * the lifetime of the request, so evaluating N grant-based actions costs exactly
 * one DB round-trip regardless of how many policies are evaluated.
 */
contextHydrator.registerVirtualAttribute(
  'active_grant_access_types',
  async ({ id }) => {
    // id = { user, resource, resourceType } threaded from authorize()
    if (!id?.user || !id?.resource || !id?.resourceType) return new Set();
    return grantService.getGrantAccessTypesForUser(
      id.user,
      id.resource,
      id.resourceType.toUpperCase(),
    );
  },
);

module.exports = { ContextHydrator, contextHydrator };
