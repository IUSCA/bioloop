function normalize_name(name) {
  // convert to lowercase
  // replace all character other than a-z, 0-9, and - with -
  // replace consecutive hyphens with one -

  return (name || '')
    .toLowerCase()
    .replaceAll(/[\W_]/g, '-')
    .replaceAll(/-+/g, '-');
}

const NATO_ALPHABET = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
  'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey',
  'xray', 'yankee', 'zulu',
];

/**
 * Creates a generator function that yields identifier suffixes.
 *
 * @param {string[]} identifiers - An array of base identifier strings
 * @returns {Function} A generator function that yields identifier suffixes
 *
 * @description
 * The returned generator yields identifiers in a cycling pattern:
 * - First, it yields each identifier from the array in order
 * - After exhausting the array, it yields suffixed versions (e.g., "identifier-1", "identifier-2")
 * - This pattern repeats indefinitely, cycling through the identifiers with incrementing numeric suffixes
 *
 * @example
 * const gen = identifier_suffix_gen(['user', 'admin', 'guest']);
 * const iterator = gen();
 * iterator.next().value; // 'user'
 * iterator.next().value; // 'admin'
 * iterator.next().value; // 'guest'
 * iterator.next().value; // 'user-1'
 * iterator.next().value; // 'admin-1'
 */
function identifier_suffix_gen(identifiers) {
  function* gen() {
    let i = 0;
    const N = identifiers.length;

    while (true) {
      if (i < N) {
        yield identifiers[i];
      } else {
        yield `${identifiers[i % N]}-${Math.floor(i / N)}`;
      }
      i += 1;
    }
  }

  return gen;
}

const nato_suffix_gen = identifier_suffix_gen(NATO_ALPHABET);

async function generate_slug({ name, is_slug_unique_fn, max_attempts = 1000 }) {
  // normalizes the name and adds incremental suffixes until the combination is unique

  const normalized_name = normalize_name(name);

  if (await is_slug_unique_fn(normalized_name)) {
    return normalized_name;
  }

  const suffix_gen = nato_suffix_gen();
  let slug = null;

  // eslint-disable-next-line no-constant-condition
  let attempts = 0;
  while (attempts < max_attempts) {
    const suffix = suffix_gen.next().value;
    slug = `${normalized_name}-${suffix}`;

    // eslint-disable-next-line no-await-in-loop
    if (await is_slug_unique_fn(slug)) {
      return slug;
    }
    attempts += 1;
  }
  throw new Error('Failed to generate a unique slug');
}

module.exports = {
  generate_slug,
};
