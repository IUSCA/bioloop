// npx jest src/utils/expression/index.test.js --verbose 2>&1

/* eslint-disable no-continue */
const fc = require('fast-check');
const { projectObject } = require('./index');

// ---------------------------------------------------------------------------
// Path utilities  (mirrors index.js traversal logic — used only in assertions)
// ---------------------------------------------------------------------------

/**
 * Enumerate every valid projection path reachable from `obj`, including:
 *   flat keys          'id'
 *   nested keys        'profile.email'
 *   array wildcards    'tags[*].label'
 *   nested wildcards   'ancestors[*].permissions[*].name'
 *
 * When an array is empty there are no items to inspect, so only the
 * `key[*]` wildcard path itself is emitted.
 */
function collectPaths(obj, prefix = '') {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return [];

  const paths = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];

    if (Array.isArray(val)) {
      paths.push(`${fullKey}[*]`);
      const sample = val.find(
        (v) => v != null && typeof v === 'object' && !Array.isArray(v),
      );
      if (sample) paths.push(...collectPaths(sample, `${fullKey}[*]`));
    } else if (val != null && typeof val === 'object') {
      paths.push(fullKey);
      paths.push(...collectPaths(val, fullKey));
    } else {
      paths.push(fullKey);
    }
  }
  return paths;
}

/**
 * Read a (possibly wildcard) path from `obj`, mirroring projectObject
 * semantics.  Returns `{ found: boolean, value: any }`.
 */
function getByPath(obj, pathStr) {
  const segments = pathStr.split('.').map((part) => {
    const m = part.match(/^([^[]+)\[\*\]$/);
    return m ? { key: m[1], array: true } : { key: part, array: false };
  });

  // cSpell: ignore segs
  function traverse(node, segs) {
    if (!segs.length) return { found: true, value: node };
    if (node == null || typeof node !== 'object') return { found: false };
    const [head, ...tail] = segs;
    if (!(head.key in node)) return { found: false };
    const val = node[head.key];
    if (head.array) {
      if (!Array.isArray(val)) return { found: false };
      if (!tail.length) return { found: true, value: val };
      return { found: true, value: val.map((item) => traverse(item, tail).value) };
    }
    return traverse(val, tail);
  }

  return traverse(obj, segments);
}

/**
 * Structural-subset check: every key (at every depth) present in `a` must
 * also exist in `b`.  Values are not compared — this verifies containment of
 * key structure, not equality.
 */
function isStructuralSubsetOf(a, b) {
  if (a == null || typeof a !== 'object') return true;
  if (Array.isArray(a)) {
    return (
      Array.isArray(b)
      && a.every((item, i) => isStructuralSubsetOf(item, b[i]))
    );
  }
  return Object.keys(a).every(
    (k) => k in b && isStructuralSubsetOf(a[k], b[k]),
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const permRecord = fc.record({
  name: fc.string({ maxLength: 10 }),
  level: fc.integer(),
});

const ancestorRecord = fc.record({
  id: fc.integer(),
  name: fc.string({ maxLength: 10 }),
  permissions: fc.array(permRecord, { maxLength: 3 }),
});

const tagRecord = fc.record({
  label: fc.string({ maxLength: 10 }),
  value: fc.integer(),
});

/** Rich source object covering all supported path types. */
const arbitraryObject = fc.record({
  id: fc.integer(),
  name: fc.string({ maxLength: 10 }),
  active: fc.boolean(),
  score: fc.integer({ min: 0, max: 100 }),
  profile: fc.record({
    email: fc.string({ maxLength: 20 }),
    age: fc.integer({ min: 0, max: 120 }),
    city: fc.string({ maxLength: 15 }),
  }),
  tags: fc.array(tagRecord, { maxLength: 4 }),
  ancestors: fc.array(ancestorRecord, { maxLength: 4 }),
});

/** Random subset of valid paths derived from a concrete object. */
function arbitraryPathsFor(obj) {
  const allPaths = collectPaths(obj);
  if (allPaths.length === 0) return fc.constant([]);
  return fc.subarray(allPaths);
}

/** Combined arbitrary: object + correlated path subset. */
const objectWithPaths = arbitraryObject.chain((obj) => arbitraryPathsFor(obj).map((paths) => ({ obj, paths })));

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('projectObject — property-based tests', () => {
  // Property 1 — Subset guarantee
  it('result contains no keys absent from the source', () => {
    fc.assert(
      fc.property(objectWithPaths, ({ obj, paths }) => {
        const result = projectObject(obj, paths);
        expect(isStructuralSubsetOf(result, obj)).toBe(true);
      }),
    );
  });

  // Property 2 — Completeness
  it('every allowed path that exists in source is present in result', () => {
    fc.assert(
      fc.property(objectWithPaths, ({ obj, paths }) => {
        const result = projectObject(obj, paths);
        for (const path of paths) {
          const srcVal = getByPath(obj, path);
          if (!srcVal.found) continue; // path absent in source — skip
          const resVal = getByPath(result, path);
          expect(resVal.found).toBe(true);
          expect(resVal.value).toStrictEqual(srcVal.value);
        }
      }),
    );
  });

  // Property 3 — Idempotency
  it('projecting an already-projected object with the same paths is stable', () => {
    fc.assert(
      fc.property(objectWithPaths, ({ obj, paths }) => {
        const once = projectObject(obj, paths);
        const twice = projectObject(once, paths);
        expect(twice).toStrictEqual(once);
      }),
    );
  });

  // Property 4 — Monotonicity
  it('adding more allowed paths never removes keys from the result', () => {
    fc.assert(
      fc.property(
        arbitraryObject.chain((obj) => {
          const allPaths = collectPaths(obj);
          if (allPaths.length === 0) {
            return fc.constant({ obj, small: [], large: [] });
          }
          return fc.subarray(allPaths).chain((small) => fc.subarray(allPaths).map((extra) => ({
            obj,
            small,
            large: [...new Set([...small, ...extra])],
          })));
        }),
        ({ obj, small, large }) => {
          const resultSmall = projectObject(obj, small);
          const resultLarge = projectObject(obj, large);
          expect(isStructuralSubsetOf(resultSmall, resultLarge)).toBe(true);
        },
      ),
    );
  });

  // Property 5 — Empty paths → empty result
  it('empty path list always yields {}', () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        expect(projectObject(obj, [])).toStrictEqual({});
      }),
    );
  });

  // Property 6 — Full paths → full object
  it('projecting with every reachable path deep-equals the source', () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        const allPaths = collectPaths(obj);
        // toEqual (not toStrictEqual) because fc.record can emit null-prototype
        // objects while projectObject always builds plain {} containers.
        expect(projectObject(obj, allPaths)).toEqual(obj);
      }),
    );
  });

  // Property 7 — Non-existent paths are silently ignored
  it('phantom paths cause no errors and produce no phantom keys', () => {
    fc.assert(
      fc.property(
        arbitraryObject,
        fc.array(
          fc.stringMatching(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/),
          { minLength: 1, maxLength: 5 },
        ),
        (obj, candidatePaths) => {
          const realPaths = new Set(collectPaths(obj));
          const phantomPaths = candidatePaths.filter((p) => !realPaths.has(p));

          let result;
          expect(() => {
            result = projectObject(obj, phantomPaths);
          }).not.toThrow();
          expect(isStructuralSubsetOf(result, obj)).toBe(true);
        },
      ),
    );
  });

  // Property 8 — Array length preservation
  it('projecting items[*].field preserves array length for every element', () => {
    fc.assert(
      fc.property(
        fc.record({
          items: fc.array(
            fc.record({
              id: fc.integer(),
              label: fc.string({ maxLength: 10 }),
            }),
            { minLength: 1, maxLength: 6 },
          ),
        }),
        (obj) => {
          const result = projectObject(obj, ['items[*].id', 'items[*].label']);
          expect(result.items).toHaveLength(obj.items.length);
        },
      ),
    );
  });

  // Property 9 — Source immutability
  it('source object is not mutated by projection', () => {
    fc.assert(
      fc.property(objectWithPaths, ({ obj, paths }) => {
        // Compare JSON strings — preserves null-prototype objects correctly
        // while still detecting any added, removed, or changed values.
        const before = JSON.stringify(obj);
        projectObject(obj, paths);
        expect(JSON.stringify(obj)).toBe(before);
      }),
    );
  });

  // Property 11 — '*' wildcard returns the full object
  it("'*' in allowedPaths returns a result that deep-equals the source", () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        expect(projectObject(obj, ['*'])).toEqual(obj);
      }),
    );
  });

  it("'*' mixed with other paths still returns the full object", () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        const somePaths = collectPaths(obj).slice(0, 2);
        expect(projectObject(obj, ['*', ...somePaths])).toEqual(obj);
      }),
    );
  });

  // Negation — basic
  it("'!path' removes a key that was included by a positive path", () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        const result = projectObject(obj, ['*', '!id']);
        expect(result).not.toHaveProperty('id');
        // Everything else from the top level should still be present
        for (const key of Object.keys(obj)) {
          if (key === 'id') continue;
          expect(result).toHaveProperty(key);
        }
      }),
    );
  });

  // Negation — negating a non-present key is a no-op
  it('negating a path not in the result causes no error and no phantom removal', () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        const result = projectObject(obj, ['id', '!nonexistent']);
        expect(result).toHaveProperty('id');
        expect(isStructuralSubsetOf(result, obj)).toBe(true);
      }),
    );
  });

  // Negation — negating an array-element field
  it("'!arr[*].field' removes that field from every array element", () => {
    fc.assert(
      fc.property(
        fc.record({
          items: fc.array(
            fc.record({ id: fc.integer(), label: fc.string({ maxLength: 10 }) }),
            { minLength: 1, maxLength: 5 },
          ),
        }),
        (obj) => {
          const result = projectObject(obj, ['items[*]', '!items[*].id']);
          expect(Array.isArray(result.items)).toBe(true);
          result.items.forEach((item) => {
            expect(item).not.toHaveProperty('id');
            expect(item).toHaveProperty('label');
          });
        },
      ),
    );
  });

  // Negation — negated paths are applied after positive paths (order irrelevant)
  it('negation wins regardless of path order in the array', () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        const withNegFirst = projectObject(obj, ['!id', '*']);
        const withNegLast = projectObject(obj, ['*', '!id']);
        expect(withNegFirst).toStrictEqual(withNegLast);
        expect(withNegFirst).not.toHaveProperty('id');
      }),
    );
  });

  // Negation — source immutability still holds
  it('negation does not mutate the source object', () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        const before = JSON.stringify(obj);
        projectObject(obj, ['*', '!id', '!profile.email']);
        expect(JSON.stringify(obj)).toBe(before);
      }),
    );
  });

  // Negation — nested path removal
  it("'!profile.email' removes only that nested key, leaving the rest of profile", () => {
    fc.assert(
      fc.property(arbitraryObject, (obj) => {
        const result = projectObject(obj, ['*', '!profile.email']);
        if (result.profile) {
          expect(result.profile).not.toHaveProperty('email');
          expect(result.profile).toHaveProperty('age');
          expect(result.profile).toHaveProperty('city');
        }
      }),
    );
  });

  // Property 10 — Order independence
  it('reversing the path list produces the same result', () => {
    fc.assert(
      fc.property(
        arbitraryObject.chain((obj) => fc.subarray(collectPaths(obj)).map((paths) => ({ obj, paths }))),
        ({ obj, paths }) => {
          const reversed = [...paths].reverse();
          expect(projectObject(obj, paths)).toStrictEqual(
            projectObject(obj, reversed),
          );
        },
      ),
    );
  });
});
