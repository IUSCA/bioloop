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

describe('projectObject keeps value types and copies containers', () => {
  it('a negation leaves BigInt and Date values as they are', () => {
    const when = new Date('2026-09-15T00:00:00Z');
    const source = { id: 1n, created_at: when, secret: 'x' };
    const result = projectObject(source, ['*', '!secret']);
    expect(result).toEqual({ id: 1n, created_at: when });
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it("'*' does not share a nested object with the source", () => {
    const source = { owner: { name: 'lab', email: 'a@b' } };
    const result = projectObject(source, ['*']);
    delete result.owner.email;
    expect(source.owner.email).toBe('a@b');
  });

  it('a whole subtree named by a path is a copy', () => {
    const source = { owner: { name: 'lab' }, tags: [{ label: 't' }] };
    const result = projectObject(source, ['owner', 'tags[*]']);
    result.owner.name = 'changed';
    result.tags[0].label = 'changed';
    expect(source).toEqual({ owner: { name: 'lab' }, tags: [{ label: 't' }] });
  });
});

// ---------------------------------------------------------------------------
// Shapes the path does not expect
//
// The properties above only generate sources whose shape matches every path. These generate
// arbitrary trees, where a path can meet null, a primitive, an array, a Date, or a key that
// exists only on the prototype.
// ---------------------------------------------------------------------------

const KEYS = ['a', 'b', 'c'];
const INHERITED_KEYS = ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'length'];

// cSpell: ignore letrec
/** A tree of plain objects and arrays with null, primitive, and Date leaves. */
const { tree: arbitraryTree } = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.constant(null),
    fc.integer(),
    fc.string({ maxLength: 3 }),
    fc.boolean(),
    fc.date({ noInvalidDate: true }),
  ),
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    tie('leaf'),
    fc.array(tie('node'), { maxLength: 3 }),
    fc.dictionary(fc.constantFrom(...KEYS), tie('node'), { maxKeys: 3 }),
  ),
  tree: fc.dictionary(fc.constantFrom(...KEYS), tie('node'), { minKeys: 1, maxKeys: 3 }),
}));

/** A path over the same keys, where any segment may carry `[*]`. */
const arbitraryPath = fc
  .array(
    fc.record({
      key: fc.constantFrom(...KEYS, ...INHERITED_KEYS),
      array: fc.boolean(),
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((segs) => segs.map(({ key, array }) => (array ? `${key}[*]` : key)).join('.'));

const arbitraryPaths = fc.array(arbitraryPath, { minLength: 1, maxLength: 4 });

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value !== 'object') return 'other';
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) return 'record';
  return 'other';
}

/**
 * Asserts that every position present in `result` exists in `source` as an own key and holds
 * the same kind of value. Returns the first mismatch as a string, or null.
 */
function firstKindMismatch(result, source, where = '$') {
  if (kindOf(result) !== kindOf(source)) {
    return `${where}: result is ${kindOf(result)}, source is ${kindOf(source)}`;
  }
  if (kindOf(result) !== 'record' && kindOf(result) !== 'array') return null;
  for (const key of Object.keys(result)) {
    if (!Object.hasOwn(source, key)) return `${where}.${key}: not an own key of the source`;
    const mismatch = firstKindMismatch(result[key], source[key], `${where}.${key}`);
    if (mismatch) return mismatch;
  }
  return null;
}

describe('projectObject — shapes the path does not expect', () => {
  it('never throws, for positive paths or negations', () => {
    fc.assert(
      fc.property(arbitraryTree, arbitraryPaths, (source, paths) => {
        expect(() => projectObject(source, paths)).not.toThrow();
        expect(() => projectObject(source, ['*', ...paths.map((p) => `!${p}`)])).not.toThrow();
      }),
    );
  });

  it('every value in the result is an own key of the source and the same kind of value', () => {
    fc.assert(
      fc.property(arbitraryTree, arbitraryPaths, (source, paths) => {
        let result;
        try {
          result = projectObject(source, paths);
        } catch {
          return; // reported by the property above
        }
        expect(firstKindMismatch(result, source)).toBeNull();
      }),
    );
  });

  it('a path that reaches null keeps the null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KEYS),
        fc.constantFrom('', '.a', '[*]', '[*].a'),
        (key, rest) => {
          expect(projectObject({ [key]: null }, [`${key}${rest}`])).toStrictEqual({ [key]: null });
        },
      ),
    );
  });

  it('a null array element stays null when a path reaches through it', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.option(fc.record({ id: fc.integer(), secret: fc.string() }), { nil: null }),
          { minLength: 1, maxLength: 5 },
        ),
        (items) => {
          const result = projectObject({ items }, ['items[*].id']);
          expect(result.items).toHaveLength(items.length);
          items.forEach((item, i) => {
            expect(result.items[i]).toStrictEqual(item === null ? null : { id: item.id });
          });
        },
      ),
    );
  });

  it('a grant with no preset projects source_preset as null, not {}', () => {
    const grant = { id: 'g1', source_preset: null, source_access_request: null };
    const paths = ['id', 'source_preset.id', 'source_preset.name', 'source_access_request.requester.name'];
    expect(projectObject(grant, paths)).toStrictEqual(grant);
  });
});
