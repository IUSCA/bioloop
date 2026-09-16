/* eslint-disable no-param-reassign */
/**
 * Object Projector — Policy-gated response projection for API output.
 *
 * Supports:
 *  - Flat keys:              'id', 'name'
 *  - Nested keys:            'profile.email', 'address.city.zip'
 *  - Array wildcard:         'ancestors[*].id'
 *  - Nested array wildcard:  'roles[*].permissions[*].name'
 *  - Mixed depth:            'data[*].tags[*].label'
 *  - Negation:               '!id', '!profile.email', '!tags[*].label'
 *                            A path prefixed with '!' is removed from the
 *                            result even if a positive path already matched it.
 *                            Negations are evaluated after all positive paths.
 */

/**
 * Parses a path string into typed segments.
 * e.g. 'ancestors[*].id' → [{ key:'ancestors', array:true }, { key:'id', array:false }]
 *
 * @param {string} path
 * @returns {{ key: string, array: boolean }[]}
 */
function parsePath(path) {
  const segments = [];
  // Split on '.' but keep '[*]' attached to the preceding key
  const parts = path.split('.');

  for (const part of parts) {
    const arrayMatch = part.match(/^([^[]+)\[\*\]$/);
    if (arrayMatch) {
      segments.push({ key: arrayMatch[1], array: true });
    } else {
      segments.push({ key: part, array: false });
    }
  }

  return segments;
}

/**
 * True for a plain object: one a path may descend into with a dot. Arrays, Dates, and other
 * class instances are not, so a path never reads their own properties such as `length`.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively walks `source` following `segments`, writing values into `target`.
 *
 * A path that reaches `null` writes `null` there. A path that meets any other value of a shape
 * it does not expect writes nothing, so the result never holds a container the source lacks.
 * Only own keys match, so a path never reads a prototype property such as `toString`.
 *
 * @param {any}    source   - Current source node, a plain object
 * @param {any}    target   - Current target node, a plain object
 * @param {Array}  segments - Remaining path segments
 */
function applyPath(source, target, segments) {
  if (!segments.length || !isPlainObject(source)) return;

  const [head, ...tail] = segments;
  const { key, array } = head;

  if (!Object.hasOwn(source, key)) return; // key missing from source — skip silently
  const value = source[key];

  if (tail.length === 0 && !array) {
    // Leaf — copy the value directly
    target[key] = value;
    return;
  }

  if (value === null) {
    if (target[key] === undefined) target[key] = null;
    return;
  }

  if (!array) {
    // Intermediate object node
    if (!isPlainObject(value)) return;
    if (!isPlainObject(target[key])) target[key] = {};
    applyPath(value, target[key], tail);
    return;
  }

  // The value must be an array; reconstruct it element-by-element
  if (!Array.isArray(value)) return;
  if (!Array.isArray(target[key])) target[key] = [];
  const targetArr = target[key];
  if (targetArr.length < value.length) targetArr.length = value.length;

  value.forEach((item, idx) => {
    if (tail.length === 0) {
      // No further path — include the entire element
      targetArr[idx] = item;
    } else if (item === null) {
      if (targetArr[idx] === undefined) targetArr[idx] = null;
    } else if (isPlainObject(item)) {
      if (!isPlainObject(targetArr[idx])) targetArr[idx] = {};
      applyPath(item, targetArr[idx], tail);
    }
    // Any other element does not have the shape the path expects, so its slot stays empty.
  });
}

/**
 * Recursively deletes a path from `target`, mirroring parsePath/applyPath
 * segment semantics.
 *
 * @param {any}   target   - Current target node
 * @param {Array} segments - Remaining path segments
 */
function removePath(target, segments) {
  if (!segments.length || !isPlainObject(target)) return;

  const [head, ...tail] = segments;
  const { key, array } = head;

  if (!Object.hasOwn(target, key)) return;

  if (tail.length === 0) {
    delete target[key];
    return;
  }

  if (array) {
    const arr = target[key];
    if (!Array.isArray(arr)) return;
    arr.forEach((item) => removePath(item, tail));
  } else {
    removePath(target[key], tail);
  }
}

/**
 * Copies the plain objects and arrays of a tree, and keeps every other value as it is.
 *
 * A `Date`, a `BigInt`, a Prisma `Decimal`, and a `Buffer` pass through unchanged, so a
 * projection keeps their types. A JSON round trip threw on `BigInt` and turned a `Date` into a
 * string. Copying the containers means no projection shares a nested object with the source.
 *
 * @param {any} value
 * @returns {any}
 */
function copyTree(value) {
  if (Array.isArray(value)) return value.map(copyTree);
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out = proto === null ? Object.create(null) : {};
  for (const key of Object.keys(value)) out[key] = copyTree(value[key]);
  return out;
}

/**
 * Projects a source object down to only the allowed attribute paths.
 *
 * Paths prefixed with '!' are negations: they are removed from the result
 * after all positive paths have been applied.  Negations are applied last
 * regardless of their position in the array.
 *
 * @param {object} source         - The full resource object to project.
 * @param {string[]} allowedPaths - List of dot/bracket-notation attribute paths.
 * @returns {object}              - New object containing only allowed attributes.
 */
function projectObject(source, allowedPaths) {
  if (!source || typeof source !== 'object') return source;

  const positivePaths = allowedPaths.filter((p) => !p.startsWith('!'));
  const negationPaths = allowedPaths
    .filter((p) => p.startsWith('!'))
    .map((p) => p.slice(1));

  let result;
  if (positivePaths.includes('*')) {
    result = { ...source };
  } else {
    result = {};
    for (const path of positivePaths) {
      applyPath(source, result, parsePath(path));
    }
  }

  // Leaf values and whole-subtree inclusions still point into the source here. Copying the
  // containers keeps negation removals, and any later change to the response, off the source.
  result = copyTree(result);
  for (const path of negationPaths) {
    removePath(result, parsePath(path));
  }

  return result;
}

module.exports = {
  copyTree,
  projectObject,
};
