/**
 * Worlds for the access model harness.
 *
 * A cell is one assignment of a value to every dimension, for one user and one dataset. A
 * world is the set of rows a cell describes: groups, memberships, a dataset, a collection,
 * and grants. The same world is built in memory for the reference model and in the database
 * for the engine.
 *
 * The full product of the dimensions is far too large for the database, so the harness uses
 * two reductions and reports their sizes.
 *
 * - All pairs: every pair of values of two dimensions appears in at least one cell.
 * - Sensitivity pairs: for every dimension, two cells that differ only in that dimension and
 *   that the reference model decides differently. A dimension with no such pair is a
 *   dimension the data cannot test, and the generator fails rather than report a pass.
 *
 * @see docs/design/groups/access-model.md — How the model is checked
 */

const DAY = 24 * 60 * 60 * 1000;

const ACCESS_TYPES = [
  'DATASET:VIEW_METADATA', 'DATASET:VIEW_SENSITIVE_METADATA', 'DATASET:LIST_FILES',
  'DATASET:DOWNLOAD', 'DATASET:COMPUTE', 'DATASET:REMOTE_ACCESS',
  'DATASET:LIST_SOURCE_DATASETS', 'DATASET:LIST_DERIVED_DATASETS',
  'COLLECTION:VIEW_METADATA', 'COLLECTION:LIST_CONTENTS',
];

/**
 * The dimensions for one user and one dataset, and every value of each. The owning group
 * and the collection in the same cell carry the resource-rule columns, so the same cells
 * decide group and collection actions too.
 */
const DATASET_DIMENSIONS = Object.freeze({
  caller: ['anonymous', 'signed_in', 'platform_admin', 'stale_platform_admin'],
  relation: [
    'none', 'direct_member', 'direct_admin', 'child_member', 'parent_admin', 'grandparent_admin',
    'sibling_admin', 'removed_member', 'expired_member',
  ],
  grant_subject: ['user', 'member_group', 'left_group', 'authenticated', 'public'],
  grant_route: ['dataset', 'collection', 'removed_collection_row'],
  grant_type: ACCESS_TYPES,
  grant_validity: ['active', 'revoked', 'superseded', 'expired', 'not_started'],
  // The archived state, on the row that carries it. A dataset has no archived column, so the
  // values name a collection, the owning group, or the group above it. `parent_group` is kept
  // because it is the discriminating case: archiving a parent must not reach what a child owns.
  // @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 6
  archived: ['none', 'collection', 'owning_group', 'parent_group'],
  deleted: ['no', 'yes'],
  owner: ['ordinary', 'quarantine'],
  seeded_grant: ['present', 'revoked'],
  // The two columns a resource rule reads. They apply to the owning group and the collection.
  profile_visibility: ['PRIVATE', 'AUTHENTICATED', 'PUBLIC'],
  contributions: ['off', 'on'],
});

const DIMENSION_NAMES = Object.keys(DATASET_DIMENSIONS);

/**
 * Whether a partial cell can occur. Only the dimensions present are checked, so the same
 * function decides whether a pair is feasible and whether a full cell is.
 * @param {Object} cell
 * @returns {boolean}
 */
function feasible(cell) {
  const has = (k) => cell[k] !== undefined;
  // An anonymous caller has no subject of their own and belongs to no group.
  if (has('caller') && cell.caller === 'anonymous') {
    if (has('relation') && cell.relation !== 'none') return false;
    if (has('grant_subject') && ['user', 'member_group', 'left_group'].includes(cell.grant_subject)) return false;
  }
  // A grant on a dataset carries a dataset access type.
  if (has('grant_route') && has('grant_type')
    && cell.grant_route === 'dataset' && !cell.grant_type.startsWith('DATASET:')) return false;
  // The quarantine group is a root group, and it is archived by its own seed.
  if (has('owner') && cell.owner === 'quarantine') {
    const groupRelations = ['child_member', 'parent_admin', 'grandparent_admin', 'sibling_admin'];
    if (has('relation') && groupRelations.includes(cell.relation)) return false;
    // The quarantine group's columns are seeded, not chosen.
    if (has('profile_visibility') && cell.profile_visibility !== 'PRIVATE') return false;
    if (has('contributions') && cell.contributions !== 'off') return false;
    if (has('archived') && ['parent_group', 'owning_group'].includes(cell.archived)) return false;
  }
  return true;
}

/** Every product cell count, before and after constraints are applied to pairs. */
function productSize() {
  return DIMENSION_NAMES.reduce((n, d) => n * DATASET_DIMENSIONS[d].length, 1);
}

/** A small seeded PRNG, so a generated set is reproducible from its seed. */
function mulberry32(seed) {
  let a = seed >>> 0; // eslint-disable-line no-bitwise
  return () => {
    /* eslint-disable no-bitwise */
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    /* eslint-enable no-bitwise */
  };
}

const pairKey = (d1, v1, d2, v2) => `${d1}=${v1}|${d2}=${v2}`;

/** Every feasible pair of values of two different dimensions. */
function feasiblePairs() {
  const pairs = new Set();
  DIMENSION_NAMES.forEach((d1, i) => {
    DIMENSION_NAMES.slice(i + 1).forEach((d2) => {
      DATASET_DIMENSIONS[d1].forEach((v1) => {
        DATASET_DIMENSIONS[d2].forEach((v2) => {
          if (feasible({ [d1]: v1, [d2]: v2 })) pairs.add(pairKey(d1, v1, d2, v2));
        });
      });
    });
  });
  return pairs;
}

function pairsOf(cell) {
  const out = [];
  DIMENSION_NAMES.forEach((d1, i) => {
    DIMENSION_NAMES.slice(i + 1).forEach((d2) => out.push(pairKey(d1, cell[d1], d2, cell[d2])));
  });
  return out;
}

/**
 * A greedy all-pairs covering set. Each round builds candidate cells that each start from an
 * uncovered pair, completes them value by value to cover the most remaining pairs, and keeps
 * the best candidate.
 * @param {Object} [options]
 * @param {number} [options.seed]
 * @param {number} [options.candidates] - candidates per round
 * @returns {Object[]} cells
 */
function allPairs({ seed = 20260915, candidates = 12 } = {}) {
  const rand = mulberry32(seed);
  const uncovered = feasiblePairs();
  const cells = [];

  while (uncovered.size) {
    const starts = [...uncovered];
    let best = null;
    let bestCount = -1;
    for (let c = 0; c < candidates; c += 1) {
      const start = starts[Math.floor(rand() * starts.length)];
      const [a, b] = start.split('|').map((kv) => kv.split('='));
      const cell = { [a[0]]: a[1], [b[0]]: b[1] };
      const order = DIMENSION_NAMES.filter((d) => cell[d] === undefined)
        .sort(() => rand() - 0.5);
      order.forEach((dim) => {
        let bestValue = null;
        let bestGain = -1;
        DATASET_DIMENSIONS[dim].forEach((value) => {
          const trial = { ...cell, [dim]: value };
          if (!feasible(trial)) return;
          const gain = Object.keys(cell)
            .filter((other) => uncovered.has(pairKey(...(DIMENSION_NAMES.indexOf(other) < DIMENSION_NAMES.indexOf(dim)
              ? [other, cell[other], dim, value] : [dim, value, other, cell[other]]))))
            .length;
          if (gain > bestGain || (gain === bestGain && rand() < 0.5)) {
            bestGain = gain;
            bestValue = value;
          }
        });
        if (bestValue === null) throw new Error(`worlds: no feasible value for ${dim} in ${JSON.stringify(cell)}`);
        cell[dim] = bestValue;
      });
      const count = pairsOf(cell).filter((p) => uncovered.has(p)).length;
      if (count > bestCount) {
        best = cell;
        bestCount = count;
      }
    }
    if (bestCount <= 0) throw new Error('worlds: the covering set stopped making progress');
    pairsOf(best).forEach((p) => uncovered.delete(p));
    cells.push(best);
  }
  return cells;
}

/**
 * The rows one cell describes. Ids carry the cell index, so many cells share one database
 * world without colliding, and the two system principals and the quarantine group are shared.
 * @param {Object} cell
 * @param {number} index
 * @param {Object} shared - `{ now, publicId, authenticatedId, quarantineId }`
 */
function materialize(cell, index, shared) {
  const { now } = shared;
  const id = (name) => `c${index}-${name}`;
  const past = new Date(now.getTime() - 30 * DAY);
  const future = new Date(now.getTime() + 30 * DAY);

  const grand = { id: id('grand'), parent: null };
  const parent = {
    id: id('parent'),
    parent: grand.id,
    allow_user_contributions: false,
    archived: cell.archived === 'parent_group',
  };
  const owner = cell.owner === 'quarantine'
    ? {
      id: shared.quarantineId,
      parent: null,
      quarantine: true,
      profile_visibility: 'PRIVATE',
      allow_user_contributions: false,
      archived: true,
    }
    : {
      id: id('owner'),
      parent: parent.id,
      allow_user_contributions: cell.contributions === 'on',
      profile_visibility: cell.profile_visibility,
      archived: cell.archived === 'owning_group',
    };
  const child = { id: id('child'), parent: owner.id };
  const sibling = { id: id('sibling'), parent: parent.id };
  const other = { id: id('other'), parent: null };
  const groups = cell.owner === 'quarantine'
    ? [grand, parent, child, sibling, other]
    : [grand, parent, owner, child, sibling, other];

  const user = {
    id: id('user'),
    anonymous: cell.caller === 'anonymous',
    platform_admin: cell.caller === 'platform_admin',
    session_platform_admin: ['platform_admin', 'stale_platform_admin'].includes(cell.caller),
  };

  const memberships = [];
  const addMembership = (group, role, extra = {}) => memberships.push({
    user: user.id, group, role, ...extra,
  });
  switch (cell.relation) {
    case 'direct_member': addMembership(owner.id, 'MEMBER'); break;
    case 'direct_admin': addMembership(owner.id, 'ADMIN'); break;
    case 'child_member': addMembership(child.id, 'MEMBER'); break;
    case 'parent_admin': addMembership(parent.id, 'ADMIN'); break;
    case 'grandparent_admin': addMembership(grand.id, 'ADMIN'); break;
    case 'sibling_admin': addMembership(sibling.id, 'ADMIN'); break;
    case 'removed_member': addMembership(owner.id, 'MEMBER', { removed: true }); break;
    case 'expired_member': addMembership(owner.id, 'MEMBER', { valid_until: past }); break;
    default: break;
  }
  if (cell.grant_subject === 'member_group') addMembership(other.id, 'MEMBER');
  if (cell.grant_subject === 'left_group') addMembership(other.id, 'MEMBER', { removed: true });

  const dataset = { id: id('dataset'), owner: owner.id, deleted: cell.deleted === 'yes' };
  const collection = {
    id: id('collection'),
    owner: owner.id,
    profile_visibility: cell.owner === 'quarantine' ? 'PRIVATE' : cell.profile_visibility,
    archived: cell.archived === 'collection',
  };
  const contains = [{
    collection: collection.id, dataset: dataset.id, removed: cell.grant_route === 'removed_collection_row',
  }];

  const subjectOf = {
    user: ['USER', user.id],
    member_group: ['GROUP', other.id],
    left_group: ['GROUP', other.id],
    authenticated: ['GROUP', shared.authenticatedId],
    public: ['GROUP', shared.publicId],
  }[cell.grant_subject];
  const validity = {
    active: {},
    revoked: { revoked: true, revocation_type: 'MANUAL' },
    superseded: { revoked: true, revocation_type: 'SUPERSEDED' },
    expired: { valid_from: new Date(past.getTime() - DAY), valid_until: past },
    not_started: { valid_from: future },
  }[cell.grant_validity];
  const grants = [
    {
      id: id('grant'),
      subject_type: subjectOf[0],
      subject: subjectOf[1],
      resource: cell.grant_route === 'dataset' ? dataset.id : collection.id,
      access_type: cell.grant_type,
      creation_type: 'MANUAL',
      ...validity,
    },
    {
      id: id('seeded'),
      subject_type: 'GROUP',
      subject: owner.id,
      resource: dataset.id,
      access_type: 'DATASET:LIST_FILES',
      creation_type: 'SYSTEM_BOOTSTRAP',
      ...(cell.seeded_grant === 'revoked' ? { revoked: true, revocation_type: 'MANUAL' } : {}),
    },
  ];

  return {
    cell,
    index,
    user,
    dataset,
    collection,
    owner,
    grand,
    parent,
    child,
    sibling,
    other,
    groups,
    memberships,
    contains,
    grants,
  };
}

/**
 * A world holding every cell at once, with the shared system groups.
 * @param {Object[]} cells
 * @param {Object} [options]
 */
function buildWorld(cells, { now = new Date('2026-09-15T12:00:00Z') } = {}) {
  const shared = {
    now,
    publicId: 'public',
    authenticatedId: 'authenticated',
    quarantineId: 'quarantine',
  };
  const fragments = cells.map((cell, i) => materialize(cell, i, shared));
  const world = {
    now,
    users: fragments.map((f) => f.user),
    groups: [
      { id: shared.publicId, parent: null, system_principal: 'PUBLIC' },
      { id: shared.authenticatedId, parent: null, system_principal: 'AUTHENTICATED' },
      // The quarantine group is archived by its own seed.
      {
        id: shared.quarantineId, parent: null, quarantine: true, archived: true,
      },
      ...fragments.flatMap((f) => f.groups),
    ],
    memberships: fragments.flatMap((f) => f.memberships),
    datasets: fragments.map((f) => f.dataset),
    collections: fragments.map((f) => f.collection),
    contains: fragments.flatMap((f) => f.contains),
    grants: fragments.flatMap((f) => f.grants),
  };
  return { world, fragments, shared };
}

/**
 * Adds, for every dimension, cells that differ from a covering cell only in that dimension
 * and that the reference decides differently on some action.
 *
 * @param {Object[]} cells - the covering set
 * @param {function(Object): string} outcomeOf - the reference outcome of one cell, as a string
 * @returns {{ cells: Object[], pairs: Object<string, [Object, Object]|null> }}
 */
function addSensitivityPairs(cells, outcomeOf) {
  const extra = [];
  const pairs = {};
  DIMENSION_NAMES.forEach((dim) => {
    pairs[dim] = null;
    // eslint-disable-next-line no-restricted-syntax
    for (const cell of cells) {
      const base = outcomeOf(cell);
      const found = DATASET_DIMENSIONS[dim]
        .filter((v) => v !== cell[dim])
        .map((v) => ({ ...cell, [dim]: v }))
        .find((variant) => feasible(variant) && outcomeOf(variant) !== base);
      if (found) {
        pairs[dim] = [cell, found];
        extra.push(found);
        break;
      }
    }
  });
  return { cells: [...cells, ...extra], pairs };
}

module.exports = {
  ACCESS_TYPES,
  DATASET_DIMENSIONS,
  DIMENSION_NAMES,
  feasible,
  feasiblePairs,
  productSize,
  allPairs,
  materialize,
  buildWorld,
  addSensitivityPairs,
};
