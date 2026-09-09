const prisma = require('@/db');

/**
 * The transitive closure of the access-type partial order, built once and cached.
 *
 * A row in grant_access_type_implication reads "implying implies implied": holding implying
 * satisfies any check for implied. Callers need the relation in both directions, so both
 * are materialised here:
 *
 *   satisfiedBy   what a caller may hold to pass a check for X
 *   expand        what holding X actually confers
 *
 * The set is small and static, so a check is a set lookup rather than a recursive query.
 *
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */

// The in-flight or completed build. Assigned once; every later caller awaits the same
// promise, so the graph is read from the database exactly once per process.
let closurePromise = null;

/**
 * Walk the implication edges from one access type, collecting everything reachable.
 * Returns the reachable set excluding the starting node, and throws on a cycle.
 */
function reachableFrom(start, edges) {
  const seen = new Set();
  // Explicit stack rather than recursion, so a long chain cannot blow the call stack.
  const stack = [...(edges.get(start) || [])];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === start) {
      throw new Error(`Access type implication graph has a cycle through ${start}`);
    }
    if (seen.has(node)) {
      // eslint-disable-next-line no-continue
      continue;
    }
    seen.add(node);
    stack.push(...(edges.get(node) || []));
  }

  return seen;
}

async function build() {
  const [types, implications] = await Promise.all([
    prisma.grant_access_type.findMany({ select: { id: true, name: true } }),
    prisma.grant_access_type_implication.findMany({
      select: { implying_id: true, implied_id: true },
    }),
  ]);

  const nameById = new Map(types.map((t) => [t.id, t.name]));

  // Forward: implying -> the types it directly implies. Reverse: implied -> the types that
  // directly imply it.
  const forward = new Map();
  const reverse = new Map();
  implications.forEach(({ implying_id, implied_id }) => {
    const implying = nameById.get(implying_id);
    const implied = nameById.get(implied_id);
    if (!implying || !implied) return;
    if (!forward.has(implying)) forward.set(implying, []);
    if (!reverse.has(implied)) reverse.set(implied, []);
    forward.get(implying).push(implied);
    reverse.get(implied).push(implying);
  });

  // Materialise both closures up front. reachableFrom throws on a cycle, so a bad graph
  // fails at startup rather than on the first request that happens to touch it.
  const impliesClosure = new Map();
  const satisfiedByClosure = new Map();
  types.forEach(({ name }) => {
    impliesClosure.set(name, new Set([name, ...reachableFrom(name, forward)]));
    satisfiedByClosure.set(name, new Set([name, ...reachableFrom(name, reverse)]));
  });

  return {
    impliesClosure, satisfiedByClosure, nameById, idByName: new Map(types.map((t) => [t.name, t.id])),
  };
}

/**
 * Build the closure if it has not been built, and return it. Called eagerly at startup so
 * the cost is paid before the server accepts requests, and lazily by anything that runs
 * outside the server, such as a test.
 *
 * @returns {Promise<{impliesClosure: Map<string, Set<string>>, satisfiedByClosure: Map<string, Set<string>>, nameById: Map<number, string>, idByName: Map<string, number>}>}
 */
function getAccessTypeClosure() {
  if (!closurePromise) {
    closurePromise = build().catch((err) => {
      // Do not cache a failure; a later caller should be able to retry.
      closurePromise = null;
      throw err;
    });
  }
  return closurePromise;
}

/**
 * Every access type whose possession satisfies a check for one of `access_types`,
 * including the requested types themselves.
 *
 * Use this to widen a *requirement* before matching it against what a user holds: asking
 * for DATASET:VIEW_METADATA should also match a grant of DATASET:DOWNLOAD.
 *
 * @param {string[]} access_types
 * @returns {Promise<string[]>}
 */
async function satisfiedBy(access_types) {
  if (!access_types || access_types.length === 0) return [];
  const { satisfiedByClosure } = await getAccessTypeClosure();

  const widened = new Set();
  access_types.forEach((name) => {
    const closure = satisfiedByClosure.get(name);
    // An access type with no row in the table still has to match itself.
    if (closure) closure.forEach((n) => widened.add(n));
    else widened.add(name);
  });
  return [...widened];
}

/**
 * Every access type conferred by holding `access_types`, including the held types
 * themselves.
 *
 * Use this to widen a *holding* before reporting it: a user with DATASET:DOWNLOAD also has
 * DATASET:LIST_FILES and DATASET:VIEW_METADATA.
 *
 * @param {Iterable<string>} access_types
 * @returns {Promise<Set<string>>}
 */
async function expand(access_types) {
  const { impliesClosure } = await getAccessTypeClosure();

  const expanded = new Set();
  [...access_types].forEach((name) => {
    const closure = impliesClosure.get(name);
    if (closure) closure.forEach((n) => expanded.add(n));
    else expanded.add(name);
  });
  return expanded;
}

/**
 * The same widening as `satisfiedBy`, for callers that hold access type ids.
 *
 * The write and preview paths carry ids, because that is what `grant.access_type_id` and
 * `access_request_item.access_type_id` store. Converting at the boundary keeps the closure
 * itself keyed by name, where the seed data and the decision record both read.
 *
 * @param {number[]} access_type_ids
 * @returns {Promise<number[]>} the given ids plus every id whose grant satisfies them
 */
async function satisfiedByIds(access_type_ids) {
  if (!access_type_ids || access_type_ids.length === 0) return [];
  const { nameById, idByName } = await getAccessTypeClosure();

  const names = access_type_ids.map((id) => nameById.get(id)).filter(Boolean);
  const widened = await satisfiedBy(names);

  const ids = new Set(access_type_ids);
  widened.forEach((name) => {
    const id = idByName.get(name);
    if (id !== undefined) ids.add(id);
  });
  return [...ids];
}

/**
 * The maximal elements of a set of access type ids: those no other member implies.
 *
 * A grant of DATASET:DOWNLOAD already satisfies every check for DATASET:LIST_FILES and
 * DATASET:VIEW_METADATA, so writing all three records one fact three times. Reducing to the
 * maximal set writes one row per fact.
 *
 * `keeps` decides whether a wider type may absorb a narrower one. The write path passes the
 * expiry comparison, because a wider type that expires sooner does not cover a narrower one
 * for the narrower one's whole life. Omit it to reduce on the order alone.
 *
 * @param {number[]} access_type_ids
 * @param {(wider: number, narrower: number) => boolean} [keeps] - true when `wider` may
 *   absorb `narrower`; defaults to always
 * @returns {Promise<number[]>} the ids to keep, in the order given
 * @see docs/design/groups/decisions.md — 7. Access types imply one another
 */
async function reduceToMaximalIds(access_type_ids, keeps = () => true) {
  if (!access_type_ids || access_type_ids.length < 2) return [...(access_type_ids ?? [])];
  const { impliesClosure, nameById } = await getAccessTypeClosure();

  const present = [...new Set(access_type_ids)];

  // `id` survives unless some other member both implies it and is allowed to absorb it.
  return present.filter((id) => !present.some((other) => {
    if (other === id) return false;
    const otherName = nameById.get(other);
    const name = nameById.get(id);
    if (!otherName || !name) return false;
    const implied = impliesClosure.get(otherName);
    // `impliesClosure` includes the type itself, and two distinct ids never share a name.
    if (!implied || !implied.has(name)) return false;
    return keeps(other, id);
  }));
}

/**
 * What each access type confers, as ids, for a client that has to show the order.
 *
 * The selector greys out a type another selection already implies, and the access
 * explanation names the grant a subject holds it through. Both need the order in the
 * browser, and neither should hard-code it.
 *
 * @returns {Promise<Map<number, number[]>>} access type id → the ids holding it also confers,
 *   excluding itself
 */
async function impliedIdsByAccessTypeId() {
  const { impliesClosure, idByName } = await getAccessTypeClosure();

  const result = new Map();
  impliesClosure.forEach((implied, name) => {
    const id = idByName.get(name);
    if (id === undefined) return;
    result.set(
      id,
      [...implied].filter((n) => n !== name).map((n) => idByName.get(n)).filter((v) => v !== undefined),
    );
  });
  return result;
}

module.exports = {
  getAccessTypeClosure,
  satisfiedBy,
  satisfiedByIds,
  expand,
  reduceToMaximalIds,
  impliedIdsByAccessTypeId,
};
