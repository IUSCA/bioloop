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
 * Recursively walks `source` following `segments`, writing values into `target`.
 *
 * @param {any}    source   - Current source node
 * @param {any}    target   - Current target node (object or array slot)
 * @param {Array}  segments - Remaining path segments
 */
function applyPath(source, target, segments) {
  if (!segments.length || source == null) return;

  const [head, ...tail] = segments;
  const { key, array } = head;

  if (!(key in source)) return; // key missing from source — skip silently

  if (array) {
    // The value must be an array; reconstruct it element-by-element
    const sourceArr = source[key];
    if (!Array.isArray(sourceArr)) return;

    if (!target[key]) target[key] = [];

    sourceArr.forEach((item, idx) => {
      if (!target[key][idx]) target[key][idx] = {};
      if (tail.length === 0) {
        // No further path — include the entire element
        target[key][idx] = item;
      } else {
        applyPath(item, target[key][idx], tail);
      }
    });
  } else if (tail.length === 0) {
    // Leaf — copy the value directly
    target[key] = source[key];
  } else {
    // Intermediate object node
    if (target[key] == null) target[key] = {};
    applyPath(source[key], target[key], tail);
  }
}

/**
 * Recursively deletes a path from `target`, mirroring parsePath/applyPath
 * segment semantics.
 *
 * @param {any}   target   - Current target node
 * @param {Array} segments - Remaining path segments
 */
function removePath(target, segments) {
  if (!segments.length || target == null) return;

  const [head, ...tail] = segments;
  const { key, array } = head;

  if (!(key in target)) return;

  if (tail.length === 0) {
    delete target[key];
    return;
  }

  if (array) {
    const arr = target[key];
    if (!Array.isArray(arr)) return;
    arr.forEach((item) => {
      if (item != null && typeof item === 'object') removePath(item, tail);
    });
  } else {
    removePath(target[key], tail);
  }
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

  if (negationPaths.length > 0) {
    // Deep-clone so that negation removals never mutate the source (leaf values
    // and whole-subtree inclusions can share references with the source).
    result = JSON.parse(JSON.stringify(result));
    for (const path of negationPaths) {
      removePath(result, parsePath(path));
    }
  }

  return result;
}

module.exports = {
  projectObject,
};
