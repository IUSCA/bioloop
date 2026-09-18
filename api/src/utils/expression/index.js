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
 * One segment of a path: a key, optionally followed by `[*]`.
 */
const SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\[\*\])?$/;

/**
 * Parses a path string into typed segments, and throws on a path the projector cannot apply.
 * e.g. 'ancestors[*].id' → [{ key:'ancestors', array:true }, { key:'id', array:false }]
 *
 * A malformed path such as `owner..name` or `items[0].id` would otherwise copy nothing and
 * report nothing.
 *
 * @param {string} path
 * @returns {{ key: string, array: boolean }[]}
 */
function parsePath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(`Invalid attribute path ${JSON.stringify(path)}: must be a non-empty string`);
  }
  return path.split('.').map((part) => {
    const match = part.match(SEGMENT);
    if (!match) {
      throw new Error(`Invalid attribute path "${path}": segment "${part}" is not a key or key[*]`);
    }
    return { key: match[1], array: Boolean(match[2]) };
  });
}

/** Compiled projections, by the identity of the path list they were compiled from. */
const compiled = new WeakMap();

/**
 * Parses a list of attribute paths once, and throws on any malformed path.
 *
 * A list is compiled the first time it is seen and reused after, so a list declared once, such
 * as an attribute rule's filters, is parsed once. `PolicyContainer.attributes()` compiles every
 * rule's list when it is registered, so a malformed path fails at startup.
 *
 * @param {string[]} paths - dot/bracket paths, `*`, and `!`-prefixed negations
 * @returns {{ wildcard: boolean, positives: Object[][], negations: Object[][] }}
 */
function compileProjection(paths) {
  if (!Array.isArray(paths)) throw new Error('Attribute paths must be an array of strings');
  const cached = compiled.get(paths);
  if (cached) return cached;

  const positives = [];
  const negations = [];
  let wildcard = false;
  paths.forEach((path) => {
    if (path === '*') {
      wildcard = true;
    } else if (typeof path === 'string' && path.startsWith('!')) {
      negations.push(parsePath(path.slice(1)));
    } else {
      positives.push(parsePath(path));
    }
  });
  const projection = Object.freeze({ wildcard, positives, negations });
  compiled.set(paths, projection);
  return projection;
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
  const { wildcard, positives, negations } = compileProjection(allowedPaths);
  if (!source || typeof source !== 'object') return source;

  let result;
  if (wildcard) {
    result = { ...source };
  } else {
    result = {};
    for (const segments of positives) {
      applyPath(source, result, segments);
    }
  }

  // Leaf values and whole-subtree inclusions still point into the source here. Copying the
  // containers keeps negation removals, and any later change to the response, off the source.
  result = copyTree(result);
  for (const segments of negations) {
    removePath(result, segments);
  }

  return result;
}

module.exports = {
  compileProjection,
  copyTree,
  projectObject,
};
