/**
 * The Engine arm: `authorizeAction` with identifiers only, against the reference model.
 *
 * Identifiers only, so hydrators and virtual attributes run exactly as they do for a route that
 * pre-fetches nothing. The user cache is seeded only for the anonymous principal, as
 * `optionalAuthenticate` does, because no user row exists for it.
 *
 * @see docs/design/groups/access-model.md — How the model is checked
 */

/* eslint-disable no-await-in-loop, no-restricted-syntax */

const { authorizeAction } = require('@/authorization');
const { PrismaHydrator } = require('@/authorization/core/hydrators/PrismaHydrator');
const { ANONYMOUS_PRINCIPAL } = require('@/constants');

const { createReference } = require('./reference');

const RESOURCE_TYPES = ['dataset', 'collection', 'group'];

function freshContext(anonymous) {
  const context = { cache: { user: new Map(), resource: new Map(), context: new Map() } };
  if (anonymous) {
    context.cache.user.set(PrismaHydrator.cacheKey('user', ANONYMOUS_PRINCIPAL.subject_id), { ...ANONYMOUS_PRINCIPAL });
  }
  return context;
}

/**
 * @param {Object} args
 * @param {Object} args.tables - from `modelTablesFrom`
 * @param {import('./reference').World} args.world
 * @param {Object[]} args.fragments - from `buildWorld`
 * @param {Map<string, string>} args.ids - from `writeWorld`
 * @returns {Promise<{ decisions: number, disagreements: Object[] }>}
 */
async function runEngineArm({
  tables, world, fragments, ids, types = RESOURCE_TYPES,
}) {
  const ref = createReference(tables, world);
  const disagreements = [];
  let decisions = 0;
  for (const f of fragments) {
    const anonymous = f.user.anonymous === true;
    const user = anonymous ? ANONYMOUS_PRINCIPAL.subject_id : ids.get(f.user.id);
    for (const resourceType of types) {
      const worldResource = { dataset: f.dataset.id, collection: f.collection.id, group: f.owner.id }[resourceType];
      const context = freshContext(anonymous);
      for (const action of Object.keys(tables.actions[resourceType])) {
        decisions += 1;
        const reference = ref.decide(f.user.id, resourceType, action, worldResource);
        let engine;
        try {
          const result = await authorizeAction(resourceType, action, {
            identifiers: { user, resource: ids.get(worldResource) },
            policyExecutionContext: context,
          });
          engine = { allowed: result.granted === true };
        } catch (err) {
          engine = { error: `${err.name}: ${err.message}` };
        }
        if (engine.error || engine.allowed !== reference.allowed) {
          disagreements.push({
            cell: f.index, dims: f.cell, resourceType, action, reference, engine,
          });
        }
      }
    }
  }
  return { decisions, disagreements };
}

/**
 * Disagreements grouped by action and direction, each with the dimension values every member
 * of the group shares. A shared value is the first place to look for the cause.
 */
function summarize(disagreements) {
  const groups = new Map();
  disagreements.forEach((d) => {
    let direction = 'reference allows, engine refuses';
    if (d.engine.error) direction = `engine throws ${d.engine.error.slice(0, 120)}`;
    else if (d.engine.allowed) direction = 'engine allows, reference refuses';
    const key = `${d.resourceType}.${d.action} | ${direction}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  return [...groups.entries()].map(([key, rows]) => {
    const shared = Object.keys(rows[0].dims)
      .filter((dim) => rows.every((r) => r.dims[dim] === rows[0].dims[dim]))
      .map((dim) => `${dim}=${rows[0].dims[dim]}`);
    return {
      key, count: rows.length, shared, example: rows[0],
    };
  }).sort((a, b) => b.count - a.count);
}

/**
 * The Creates arm: `dataset.create` and `collection.create` decided as the create routes decide
 * them, with no resource id and the owning group named in the pre-fetched resource.
 *
 * Authorization does not read the state of the group a create names: whether that group is
 * archived is the create's own state rule, which the service asserts and which answers 409.
 * So every cell is decided here, and the archived dimension changes nothing this arm sees.
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 *
 * @returns {Promise<{ decisions: number, disagreements: Object[] }>}
 */
async function runCreatesArm({
  tables, world, fragments, ids,
}) {
  const ref = createReference(tables, world);
  const disagreements = [];
  let decisions = 0;
  for (const f of fragments) {
    const anonymous = f.user.anonymous === true;
    const user = anonymous ? ANONYMOUS_PRINCIPAL.subject_id : ids.get(f.user.id);
    for (const resourceType of ['dataset', 'collection']) {
      decisions += 1;
      const worldResource = resourceType === 'dataset' ? f.dataset.id : f.collection.id;
      const reference = ref.decide(f.user.id, resourceType, 'create', worldResource);
      let engine;
      try {
        const result = await authorizeAction(resourceType, 'create', {
          identifiers: { user, resource: null },
          policyExecutionContext: freshContext(anonymous),
          preFetched: { resource: { owner_group_id: ids.get(f.owner.id) } },
        });
        engine = { allowed: result.granted === true };
      } catch (err) {
        engine = { error: `${err.name}: ${err.message}` };
      }
      if (engine.error || engine.allowed !== reference.allowed) {
        disagreements.push({
          cell: f.index, dims: f.cell, resourceType, action: 'create', reference, engine,
        });
      }
    }
  }
  return { decisions, disagreements };
}

module.exports = {
  runEngineArm, runCreatesArm, summarize, RESOURCE_TYPES,
};
